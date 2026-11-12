package de.lafamilia.metrics;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Properties;
import java.util.concurrent.Executors;

/** Read-only TPS/uptime endpoint. No names, UUIDs or server-control functions. */
public final class LaFamiliaServerMetrics implements ModInitializer {
    private static final Object LOCK = new Object();
    private static final Deque<Long> TICKS = new ArrayDeque<>();
    private static volatile long startedMillis = 0;
    private static volatile HttpServer http;
    private static final long WINDOW_NS = 5_000_000_000L;

    @Override
    public void onInitialize() {
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            final long now = System.nanoTime();
            synchronized (LOCK) {
                TICKS.addLast(now);
                while (!TICKS.isEmpty() && now - TICKS.getFirst() > WINDOW_NS) TICKS.removeFirst();
            }
        });
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            startedMillis = System.currentTimeMillis();
            synchronized (LOCK) { TICKS.clear(); }
            try {
                startServer();
            } catch (Exception error) {
                System.err.println("[La Familia Metrics] HTTP-Server konnte nicht gestartet werden: " + error);
            }
        });
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            final HttpServer instance = http;
            http = null;
            if (instance != null) instance.stop(0);
            startedMillis = 0;
            synchronized (LOCK) { TICKS.clear(); }
        });
    }

    private static void startServer() throws IOException {
        Path file = FabricLoader.getInstance().getConfigDir().resolve("lafamilia-servermetrics.properties");
        Properties props = new Properties();
        props.setProperty("bind", "127.0.0.1");
        props.setProperty("port", "25566");
        if (Files.exists(file)) {
            try (var input = Files.newInputStream(file)) { props.load(input); }
        } else {
            Files.createDirectories(file.getParent());
            try (var output = Files.newOutputStream(file)) {
                props.store(output, "La Familia Metrics: set bind=0.0.0.0 only if public access is intended");
            }
        }
        int port = Integer.parseInt(props.getProperty("port", "25566").trim());
        if (port < 1 || port > 65535) throw new IllegalArgumentException("Port außerhalb 1-65535");
        String bind = props.getProperty("bind", "127.0.0.1").trim();
        HttpServer instance = HttpServer.create(new InetSocketAddress(bind, port), 0);
        instance.createContext("/status", LaFamiliaServerMetrics::respond);
        instance.setExecutor(Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "LaFamilia-Metrics-HTTP");
            thread.setDaemon(true);
            return thread;
        }));
        instance.start();
        http = instance;
        System.out.println("[La Familia Metrics] Abrufbereit auf http://" + bind + ":" + port + "/status");
    }

    private static double getTps() {
        synchronized (LOCK) {
            if (TICKS.size() < 2) return 0;
            long nanos = TICKS.getLast() - TICKS.getFirst();
            if (nanos <= 0) return 0;
            return Math.min(20, Math.round((TICKS.size() - 1) * 1_000_000_000.0 / nanos * 10.0) / 10.0);
        }
    }

    private static void respond(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Allow", "GET");
            exchange.sendResponseHeaders(405, -1);
            exchange.close();
            return;
        }
        if (!"/status".equals(exchange.getRequestURI().getPath())) {
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
            return;
        }
        long uptime = startedMillis > 0 ? Math.max(0,(System.currentTimeMillis()-startedMillis)/1000) : 0;
        String json = "{\"tps\":" + getTps() + ",\"uptimeSeconds\":" + uptime + "}";
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream output = exchange.getResponseBody()) { output.write(body); }
    }
}
