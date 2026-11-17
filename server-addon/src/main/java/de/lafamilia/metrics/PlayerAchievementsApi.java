package de.lafamilia.metrics;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.advancement.AdvancementEntry;
import net.minecraft.advancement.AdvancementProgress;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import net.minecraft.util.WorldSavePath;

import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Authenticated, read-only Minecraft advancements.
 * Called exclusively after PlayerStatsApi has checked the per-player token.
 * Does not expose other players or incomplete / hidden advancements.
 */
final class PlayerAchievementsApi {
    private static final int MAX_ITEMS = 40;
    private static final long MAX_FILE_BYTES = 6L * 1024L * 1024L;
    private static final DateTimeFormatter VANILLA_DATE =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss Z");

    private PlayerAchievementsApi() {}

    static JsonObject read(MinecraftServer server, UUID uuid) throws Exception {
        ServerPlayerEntity player = server.getPlayerManager().getPlayer(uuid);
        if (player != null) return readOnline(server, player, uuid);
        return readOffline(server, uuid);
    }

    private static JsonObject readOnline(MinecraftServer server, ServerPlayerEntity player, UUID uuid) {
        List<CompletedAdvancement> completed = new ArrayList<>();
        for (AdvancementEntry entry : server.getAdvancementLoader().getAdvancements()) {
            if (!visible(entry)) continue;
            AdvancementProgress progress = player.getAdvancementTracker().getProgress(entry);
            if (!progress.isDone()) continue;
            Instant obtained = progress.getEarliestProgressObtainDate();
            completed.add(new CompletedAdvancement(entry.id().toString(),
                title(entry), obtained == null ? null : obtained.toString()));
        }
        return response(uuid, true, true, completed);
    }

    private static JsonObject readOffline(MinecraftServer server, UUID uuid) throws Exception {
        Path file = server.getSavePath(WorldSavePath.ADVANCEMENTS).resolve(uuid + ".json");
        if (!Files.isRegularFile(file)) return response(uuid, false, false, List.of());
        if (Files.size(file) > MAX_FILE_BYTES) throw new IllegalArgumentException("Advancementdatei zu groß");
        List<CompletedAdvancement> completed = new ArrayList<>();
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            JsonObject data = JsonParser.parseReader(reader).getAsJsonObject();
            for (Map.Entry<String, JsonElement> item : data.entrySet()) {
                if (!item.getValue().isJsonObject()) continue;
                JsonObject progress = item.getValue().getAsJsonObject();
                if (!progress.has("done") || !progress.get("done").isJsonPrimitive()
                    || !progress.get("done").getAsBoolean()) continue;
                Identifier id = Identifier.tryParse(item.getKey());
                if (id == null) continue;
                AdvancementEntry entry = server.getAdvancementLoader().get(id);
                if (entry == null || !visible(entry)) continue;
                completed.add(new CompletedAdvancement(id.toString(),title(entry),savedDate(progress)));
            }
        }
        return response(uuid, true, false, completed);
    }

    private static boolean visible(AdvancementEntry entry) {
        return entry != null
            && !entry.id().getPath().startsWith("recipes/")
            && entry.value().display().isPresent();
    }

    private static String title(AdvancementEntry entry) {
        String name = entry.value().display().get().getTitle().getString();
        // Server-side TranslatableText may expose a translation key instead of a
        // localized string. The launcher falls back to a readable advancement ID.
        return name.length() <= 120 ? name : name.substring(0,120);
    }

    private static String savedDate(JsonObject progress) {
        if (!progress.has("criteria") || !progress.get("criteria").isJsonObject()) return null;
        Instant earliest = null;
        for (JsonElement value : progress.getAsJsonObject("criteria").asMap().values()) {
            if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) continue;
            try {
                String raw = value.getAsString();
                Instant timestamp;
                try { timestamp = Instant.parse(raw); }
                catch (Exception ignored) { timestamp = OffsetDateTime.parse(raw, VANILLA_DATE).toInstant(); }
                if (earliest == null || timestamp.isBefore(earliest)) earliest = timestamp;
            } catch (Exception ignored) {}
        }
        return earliest == null ? null : earliest.toString();
    }

    private static JsonObject response(UUID uuid, boolean available, boolean online,
                                       List<CompletedAdvancement> advancements) {
        List<CompletedAdvancement> ordered = new ArrayList<>(advancements);
        ordered.sort(Comparator.comparing(
            (CompletedAdvancement a) -> a.obtainedAt == null ? "" : a.obtainedAt
        ).reversed());
        JsonObject result = new JsonObject();
        result.addProperty("schema", 1);
        result.addProperty("uuid", uuid.toString());
        result.addProperty("available", available);
        result.addProperty("online", online);
        result.addProperty("completed", ordered.size());
        result.addProperty("source", online ? "live" : available ? "saved" : "not_saved");
        JsonArray items = new JsonArray();
        for (int i=0; i<Math.min(ordered.size(),MAX_ITEMS); i++) {
            CompletedAdvancement a = ordered.get(i);
            JsonObject item = new JsonObject();
            item.addProperty("id", a.id);
            item.addProperty("title", a.title);
            if (a.obtainedAt == null) item.add("obtainedAt", com.google.gson.JsonNull.INSTANCE);
            else item.addProperty("obtainedAt", a.obtainedAt);
            items.add(item);
        }
        result.add("items", items);
        return result;
    }

    private record CompletedAdvancement(String id, String title, String obtainedAt) {}
}
