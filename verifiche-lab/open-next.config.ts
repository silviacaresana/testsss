import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Nessuna cache incrementale su R2: tutte le pagine dell'app sono dinamiche (force-dynamic).
export default defineCloudflareConfig();
