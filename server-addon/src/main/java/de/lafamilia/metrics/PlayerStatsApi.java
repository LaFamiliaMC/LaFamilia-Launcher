package de.lafamilia.metrics;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.block.Block;
import net.minecraft.registry.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.stat.ServerStatHandler;
import net.minecraft.stat.Stats;
import net.minecraft.text.Text;
import net.minecraft.util.WorldSavePath;

import java.io.IOException;
import java.io.OutputStream;
import java.io.Reader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.AtomicMoveNotSupportedException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Private read-only player statistics; players opt in with /lfstats link.
 * Only a SHA-256 digest of a per-player random token is persisted on the server.
 * Keep the existing unauthenticated /status endpoint separate.
 */
public final class PlayerStatsApi {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Map<UUID, String> TOKEN_HASHES = new HashMap<>();
    private static final Object LOCK = new Object();
    private static volatile MinecraftServer minecraftServer;
    private static volatile boolean enabled;
    private static Path tokenFile;

    private PlayerStatsApi() {}

    public static void registerCommands() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registry, environment) ->
            dispatcher.register(CommandManager.literal("lfstats")
                .then(CommandManager.literal("link").executes(ctx -> {
                    var player = ctx.getSource().getPlayerOrThrow();
                    if (!enabled) {
                        ctx.getSource().sendError(Text.literal("La Familia Spielerstatistiken sind auf diesem Server deaktiviert."));
                        return 0;
                    }
                    byte[] secret = new byte[32];
                    RANDOM.nextBytes(secret);
                    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
                    UUID uuid = player.getUuid();
                    synchronized (LOCK) {
                        String previous = TOKEN_HASHES.put(uuid, sha256(token));
                        try {
                            persist();
                        } catch (IOException error) {
                            if (previous == null) TOKEN_HASHES.remove(uuid);
                            else TOKEN_HASHES.put(uuid, previous);
                            ctx.getSource().sendError(Text.literal("Verbindungsschlüssel konnte nicht gespeichert werden."));
                            return 0;
                        }
                    }
                    ctx.getSource().sendFeedback(() -> Text.literal(
                        "§6La Familia §7– Dein privater Statistik-Schlüssel: §e" + token +
                        " §7| Im Launcher unter Profil eintragen. Geheim halten! Ein erneutes /lfstats link ersetzt ihn."), false);
                    return 1;
                }))
                .then(CommandManager.literal("unlink").executes(ctx -> {
                    var player = ctx.getSource().getPlayerOrThrow();
                    synchronized (LOCK) {
                        String removed = TOKEN_HASHES.remove(player.getUuid());
                        try {
                            persist();
                        } catch (IOException error) {
                            if (removed != null) TOKEN_HASHES.put(player.getUuid(), removed);
                            ctx.getSource().sendError(Text.literal("Der Statistik-Schlüssel konnte nicht widerrufen werden."));
                            return 0;
                        }
                    }
                    ctx.getSource().sendFeedback(() -> Text.literal(
                        "§6La Familia §7– Dein Statistik-Schlüssel wurde widerrufen."), false);
                    return 1;
                }))
            )
        );
    }

    public static void start(MinecraftServer server, HttpServer http, boolean statsEnabled) throws IOException {
        minecraftServer = server;
        enabled = statsEnabled;
        tokenFile = FabricLoader.getInstance().getConfigDir().resolve("lafamilia-player-links.properties");
        synchronized (LOCK) {
            TOKEN_HASHES.clear();
            if (Files.isRegularFile(tokenFile)) {
                Properties props = new Properties();
                try (var input = Files.newInputStream(tokenFile)) { props.load(input); }
                for (String id : props.stringPropertyNames()) {
                    try {
                        UUID uuid = UUID.fromString(id);
                        String hash = props.getProperty(id);
                        if (hash != null && hash.matches("[a-f0-9]{64}")) TOKEN_HASHES.put(uuid, hash);
                    } catch (IllegalArgumentException ignored) {}
                }
            }
        }
        http.createContext("/player/", PlayerStatsApi::respond);
        System.out.println("[La Familia Metrics] Persönliche Statistiken " +
            (statsEnabled ? "aktiv (pro Spieler mit /lfstats link)" : "deaktiviert") + ".");
    }

    public static void stop() {
        enabled = false;
        minecraftServer = null;
        synchronized (LOCK) { TOKEN_HASHES.clear(); }
    }

    private static String sha256(String token) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
            return java.util.HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    private static void persist() throws IOException {
        if (tokenFile == null) throw new IOException("Keine Schlüsseldatei konfiguriert");
        Files.createDirectories(tokenFile.getParent());
        Properties props = new Properties();
        TOKEN_HASHES.forEach((id, digest) -> props.setProperty(id.toString(), digest));
        Path temporary = Files.createTempFile(tokenFile.getParent(), ".lafamilia-links-", ".tmp");
        try {
            try (var out = Files.newOutputStream(temporary)) {
                props.store(out, "Private player statistics token hashes - never publish");
            }
            try { Files.move(temporary, tokenFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException error) {
                Files.move(temporary, tokenFile, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally { Files.deleteIfExists(temporary); }
    }

    private static boolean authorized(UUID uuid, String header) {
        if (header == null || !header.startsWith("Bearer ") || header.length() > 100) return false;
        String token = header.substring(7);
        if (!token.matches("[A-Za-z0-9_-]{43}")) return false;
        String supplied = sha256(token);
        synchronized (LOCK) {
            String expected = TOKEN_HASHES.get(uuid);
            return expected != null && MessageDigest.isEqual(
                supplied.getBytes(StandardCharsets.US_ASCII),
                expected.getBytes(StandardCharsets.US_ASCII));
        }
    }

    private static void respond(HttpExchange exchange) throws IOException {
        try {
            if (!"GET".equals(exchange.getRequestMethod())) {
                exchange.getResponseHeaders().set("Allow", "GET");
                send(exchange, 405, "{\"error\":\"method_not_allowed\"}");
                return;
            }
            if (!enabled || minecraftServer == null) {
                send(exchange, 503, "{\"error\":\"statistics_disabled\"}");
                return;
            }
            URI uri = exchange.getRequestURI();
            if (uri.getRawQuery() != null) { send(exchange, 400, "{\"error\":\"query_not_allowed\"}"); return; }
            String name = uri.getPath().substring("/player/".length());
            boolean achievements = name.endsWith("/advancements");
            if (achievements) name = name.substring(0, name.length() - "/advancements".length());
            if (!name.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")) {
                send(exchange, 400, "{\"error\":\"invalid_uuid\"}"); return;
            }
            UUID uuid = UUID.fromString(name);
            if (!authorized(uuid, exchange.getRequestHeaders().getFirst("Authorization"))) {
                exchange.getResponseHeaders().set("WWW-Authenticate", "Bearer realm=\"LaFamilia\"");
                send(exchange, 401, "{\"error\":\"unauthorized\"}");
                return;
            }
            MinecraftServer server = minecraftServer;
            // Auch abgeschlossene Advancements benutzen denselben UUID-gebundenen
            // Bearer-Schlüssel; /status und bisherige /player/<UUID> bleiben unverändert.
            if (achievements) {
                CompletableFuture<JsonObject> results = new CompletableFuture<>();
                server.execute(() -> {
                    try { results.complete(PlayerAchievementsApi.read(server, uuid)); }
                    catch (Exception error) { results.completeExceptionally(error); }
                });
                try { send(exchange, 200, results.get(3, TimeUnit.SECONDS).toString()); }
                catch (Exception error) { send(exchange, 503, "{\\"error\\":\\"advancements_unavailable\\"}"); }
                return;
            }
            CompletableFuture<Snapshot> live = new CompletableFuture<>();
            server.execute(() -> {
                try { live.complete(readOnline(server, uuid)); }
                catch (Exception error) { live.completeExceptionally(error); }
            });
            Snapshot snapshot;
            try { snapshot = live.get(3, TimeUnit.SECONDS); }
            catch (Exception error) { send(exchange, 503, "{\"error\":\"server_busy\"}"); return; }
            if (snapshot == null) snapshot = readOffline(server, uuid);
            if (snapshot == null) { send(exchange, 404, "{\"error\":\"no_statistics_yet\"}"); return; }
            send(exchange, 200, snapshot.toJson(uuid));
        } catch (Exception error) {
            send(exchange, 500, "{\"error\":\"internal_error\"}");
        }
    }

    private static Snapshot readOnline(MinecraftServer server, UUID uuid) {
        ServerPlayerEntity player = server.getPlayerManager().getPlayer(uuid);
        if (player == null) return null;
        ServerStatHandler handler = player.getStatHandler();
        long mined = 0;
        for (Block block : Registries.BLOCK) mined += handler.getStat(Stats.MINED.getOrCreateStat(block));
        return new Snapshot(
            handler.getStat(Stats.CUSTOM.getOrCreateStat(Stats.PLAY_TIME)),
            handler.getStat(Stats.CUSTOM.getOrCreateStat(Stats.DEATHS)),
            handler.getStat(Stats.CUSTOM.getOrCreateStat(Stats.MOB_KILLS)),
            handler.getStat(Stats.CUSTOM.getOrCreateStat(Stats.PLAYER_KILLS)),
            mined, player.experienceLevel, true);
    }

    private static Snapshot readOffline(MinecraftServer server, UUID uuid) throws IOException {
        Path file = server.getSavePath(WorldSavePath.STATS).resolve(uuid.toString() + ".json");
        if (!Files.isRegularFile(file) || Files.size(file) > 2 * 1024 * 1024) return null;
        try (Reader input = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            JsonObject root = JsonParser.parseReader(input).getAsJsonObject();
            if (!root.has("stats") || !root.get("stats").isJsonObject()) return null;
            JsonObject stats = root.getAsJsonObject("stats");
            JsonObject custom = child(stats, "minecraft:custom");
            JsonObject mined = child(stats, "minecraft:mined");
            long count = 0;
            if (mined != null) {
                for (Map.Entry<String, JsonElement> e : mined.entrySet()) count += safeNumber(e.getValue());
            }
            return new Snapshot(number(custom, "minecraft:play_time"), number(custom, "minecraft:deaths"),
                number(custom, "minecraft:mob_kills"), number(custom, "minecraft:player_kills"),
                count, null, false);
        } catch (IllegalStateException | com.google.gson.JsonParseException error) { return null; }
    }

    private static JsonObject child(JsonObject parent, String key) {
        if (parent == null || !parent.has(key) || !parent.get(key).isJsonObject()) return null;
        return parent.getAsJsonObject(key);
    }
    private static long number(JsonObject object, String name) {
        return object != null && object.has(name) ? safeNumber(object.get(name)) : 0;
    }
    private static long safeNumber(JsonElement value) {
        try {
            long n = value.getAsLong();
            return n < 0 || n > 2_147_483_647L ? 0 : n;
        } catch (Exception ignored) { return 0; }
    }

    private record Snapshot(long playTimeTicks, long deaths, long mobKills, long playerKills,
                            long blocksMined, Integer mcLevel, boolean online) {
        private String toJson(UUID uuid) {
            return "{\"schema\":1,\"uuid\":\"" + uuid + "\",\"online\":" + online +
                ",\"playTimeTicks\":" + playTimeTicks + ",\"deaths\":" + deaths +
                ",\"mobKills\":" + mobKills + ",\"playerKills\":" + playerKills +
                ",\"blocksMined\":" + blocksMined +
                ",\"mcLevel\":" + (mcLevel == null ? "null" : mcLevel) +
                ",\"blocksPlaced\":null,\"rank\":null,\"quests\":null}";
        }
    }

    private static void send(HttpExchange exchange, int code, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(code, body.length);
        try (OutputStream stream = exchange.getResponseBody()) { stream.write(body); }
    }
}
