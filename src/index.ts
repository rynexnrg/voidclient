interface Env {
	DB: D1Database;
}

interface UserRequest {
	uuid?: string;
	username?: string;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

function cors(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		// CORS Preflight
		if (request.method === "OPTIONS") {
			return cors();
		}

		// ==========================================
		// API STATUS
		// ==========================================
		if (url.pathname === "/api/status" && request.method === "GET") {
			return json({
				success: true,
				service: "VoidClient",
				status: "online",
				version: "1.0.0",
			});
		}

		// ==========================================
		// LOGIN / ACCOUNT
		// ==========================================
		if (url.pathname === "/api/login" && request.method === "POST") {
			try {
				const body = (await request.json()) as UserRequest;

				const uuid = body.uuid?.trim();
				const username = body.username?.trim();

				if (!uuid || !username) {
					return json(
						{
							success: false,
							error: "UUID und Username sind erforderlich.",
						},
						400
					);
				}

				// Prüfen, ob der Minecraft-Account bereits existiert
				const existing = await env.DB
					.prepare(
						"SELECT id, minecraft_uuid, username, online, last_online, created_at FROM users WHERE minecraft_uuid = ?"
					)
					.bind(uuid)
					.first();

				if (existing) {
					// Username aktualisieren und Benutzer online setzen
					await env.DB
						.prepare(
							"UPDATE users SET username = ?, online = 1, last_online = unixepoch() WHERE minecraft_uuid = ?"
						)
						.bind(username, uuid)
						.run();

					const user = await env.DB
						.prepare(
							"SELECT id, minecraft_uuid, username, online, last_online, created_at FROM users WHERE minecraft_uuid = ?"
						)
						.bind(uuid)
						.first();

					return json({
						success: true,
						message: "Willkommen zurück!",
						user,
						newAccount: false,
					});
				}

				// Neuen Benutzer erstellen
				const result = await env.DB
					.prepare(
						`INSERT INTO users
						(minecraft_uuid, username, online, last_online)
						VALUES (?, ?, 1, unixepoch())`
					)
					.bind(uuid, username)
					.run();

				const user = await env.DB
					.prepare(
						"SELECT id, minecraft_uuid, username, online, last_online, created_at FROM users WHERE id = ?"
					)
					.bind(result.meta.last_row_id)
					.first();

				return json({
					success: true,
					message: "VoidClient-Account erstellt!",
					user,
					newAccount: true,
				});
			} catch (error) {
				console.error(error);

				return json(
					{
						success: false,
						error: "Login konnte nicht verarbeitet werden.",
					},
					500
				);
			}
		}

		// ==========================================
		// HEARTBEAT / ONLINE STATUS
		// ==========================================
		if (url.pathname === "/api/heartbeat" && request.method === "POST") {
			try {
				const body = (await request.json()) as UserRequest;
				const uuid = body.uuid?.trim();

				if (!uuid) {
					return json(
						{
							success: false,
							error: "UUID ist erforderlich.",
						},
						400
					);
				}

				const result = await env.DB
					.prepare(
						`UPDATE users
						 SET online = 1,
							 last_online = unixepoch()
						 WHERE minecraft_uuid = ?`
					)
					.bind(uuid)
					.run();

				if (result.meta.changes === 0) {
					return json(
						{
							success: false,
							error: "Benutzer nicht gefunden.",
						},
						404
					);
				}

				return json({
					success: true,
					online: true,
					timestamp: Math.floor(Date.now() / 1000),
				});
			} catch (error) {
				console.error(error);

				return json(
					{
						success: false,
						error: "Heartbeat konnte nicht verarbeitet werden.",
					},
					500
				);
			}
		}

		// ==========================================
		// LOGOUT
		// ==========================================
		if (url.pathname === "/api/logout" && request.method === "POST") {
			try {
				const body = (await request.json()) as UserRequest;
				const uuid = body.uuid?.trim();

				if (!uuid) {
					return json(
						{
							success: false,
							error: "UUID ist erforderlich.",
						},
						400
					);
				}

				await env.DB
					.prepare(
						"UPDATE users SET online = 0, last_online = unixepoch() WHERE minecraft_uuid = ?"
					)
					.bind(uuid)
					.run();

				return json({
					success: true,
					online: false,
				});
			} catch (error) {
				console.error(error);

				return json(
					{
						success: false,
						error: "Logout konnte nicht verarbeitet werden.",
					},
					500
				);
			}
		}

		// ==========================================
		// ONLINE COUNT
		// ==========================================
		if (url.pathname === "/api/online-count" && request.method === "GET") {
			try {
				// Benutzer gelten bis 90 Sekunden nach ihrem
				// letzten Heartbeat als online.
				const result = await env.DB
					.prepare(
						`SELECT COUNT(*) AS count
						 FROM users
						 WHERE online = 1
						 AND last_online >= unixepoch() - 90`
					)
					.first<{ count: number }>();

				return json({
					success: true,
					online: Number(result?.count ?? 0),
				});
			} catch (error) {
				console.error(error);

				return json(
					{
						success: false,
						error: "Online-Spieler konnten nicht geladen werden.",
					},
					500
				);
			}
		}

		// ==========================================
		// PLAYER SEARCH
		// ==========================================
		if (url.pathname === "/api/players/search" && request.method === "GET") {
			try {
				const username = url.searchParams.get("username")?.trim();

				if (!username) {
					return json(
						{
							success: false,
							error: "Username ist erforderlich.",
						},
						400
					);
				}

				const result = await env.DB
					.prepare(
						`SELECT
							id,
							minecraft_uuid,
							username,
							online,
							last_online,
							created_at
						 FROM users
						 WHERE username LIKE ?
						 ORDER BY username ASC
						 LIMIT 20`
					)
					.bind(`%${username}%`)
					.all();

				return json({
					success: true,
					players: result.results,
				});
			} catch (error) {
				console.error(error);

				return json(
					{
						success: false,
						error: "Spielersuche fehlgeschlagen.",
					},
					500
				);
			}
		}

		// ==========================================
		// UNKNOWN API
		// ==========================================
		if (url.pathname.startsWith("/api/")) {
			return json(
				{
					success: false,
					error: "API-Endpunkt nicht gefunden.",
				},
				404
			);
		}

		// ==========================================
		// STARTSEITE
		// ==========================================
		return new Response(
			`
			<!DOCTYPE html>
			<html lang="de">
			<head>
				<meta charset="UTF-8">
				<title>VoidClient API</title>
				<style>
					body {
						background: #10141c;
						color: white;
						font-family: Arial, sans-serif;
						padding: 40px;
					}

					h1 {
						color: #00aaff;
					}

					code {
						background: #1c2330;
						padding: 5px 8px;
						border-radius: 5px;
					}

					.endpoint {
						margin: 12px 0;
						padding: 12px;
						background: #181e29;
						border-radius: 8px;
					}
				</style>
			</head>

			<body>
				<h1>VoidClient API</h1>

				<p>🟢 Service läuft.</p>

				<h2>API</h2>

				<div class="endpoint">
					GET <code>/api/status</code>
				</div>

				<div class="endpoint">
					POST <code>/api/login</code>
				</div>

				<div class="endpoint">
					POST <code>/api/heartbeat</code>
				</div>

				<div class="endpoint">
					POST <code>/api/logout</code>
				</div>

				<div class="endpoint">
					GET <code>/api/online-count</code>
				</div>

				<div class="endpoint">
					GET <code>/api/players/search</code>
				</div>
			</body>
			</html>
			`,
			{
				headers: {
					"Content-Type": "text/html; charset=utf-8",
				},
			}
		);
	},
} satisfies ExportedHandler<Env>;
