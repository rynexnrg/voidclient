import { renderHtml } from "./renderHtml";

interface Env {
	DB: D1Database;
}

interface UserRequest {
	minecraft_uuid?: string;
	username?: string;
}

interface OnlineRequest {
	minecraft_uuid?: string;
	username?: string;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=UTF-8",
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
			"access-control-allow-headers": "Content-Type",
		},
	});
}

function normalizeUsername(username: string): string {
	return username.trim();
}

function normalizeUuid(uuid: string): string {
	return uuid.trim().replace(/-/g, "").toLowerCase();
}

export default {
	async fetch(request, env): Promise<Response> {
		try {
			/*
			 * ==========================================
			 * CORS / OPTIONS
			 * ==========================================
			 */

			if (request.method === "OPTIONS") {
				return new Response(null, {
					status: 204,
					headers: {
						"access-control-allow-origin": "*",
						"access-control-allow-methods":
							"GET, POST, DELETE, OPTIONS",
						"access-control-allow-headers": "Content-Type",
					},
				});
			}

			const url = new URL(request.url);
			const path = url.pathname;

			/*
			 * ==========================================
			 * API: HEALTH
			 * ==========================================
			 *
			 * Test:
			 * https://voidclient.rynexnrg.workers.dev/api/health
			 */

			if (path === "/api/health" && request.method === "GET") {
				return json({
					success: true,
					service: "VoidClient Launcher Service",
					status: "online",
					database: "connected",
					timestamp: Date.now(),
				});
			}

			/*
			 * ==========================================
			 * API: REGISTER / UPDATE USER
			 * ==========================================
			 *
			 * POST /api/user/register
			 *
			 * JSON:
			 * {
			 *   "minecraft_uuid": "...",
			 *   "username": "..."
			 * }
			 */

			if (
				path === "/api/user/register" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as UserRequest;

				if (!body.minecraft_uuid || !body.username) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid und username sind erforderlich.",
						},
						400
					);
				}

				const uuid = normalizeUuid(body.minecraft_uuid);
				const username = normalizeUsername(body.username);

				if (!uuid || !username) {
					return json(
						{
							success: false,
							error: "Ungültige Daten.",
						},
						400
					);
				}

				/*
				 * Prüfen, ob Benutzer bereits existiert
				 */

				const existing = await env.DB
					.prepare(
						`SELECT id, minecraft_uuid, username, online, last_online, created_at
						 FROM users
						 WHERE minecraft_uuid = ?`
					)
					.bind(uuid)
					.first();

				if (existing) {
					/*
					 * Existierenden Benutzer aktualisieren
					 */

					await env.DB
						.prepare(
							`UPDATE users
							 SET username = ?,
							     online = 1,
							     last_online = unixepoch()
							 WHERE minecraft_uuid = ?`
						)
						.bind(username, uuid)
						.run();

					const updated = await env.DB
						.prepare(
							`SELECT id, minecraft_uuid, username, online, last_online, created_at
							 FROM users
							 WHERE minecraft_uuid = ?`
						)
						.bind(uuid)
						.first();

					return json({
						success: true,
						new_user: false,
						message: "Benutzer aktualisiert.",
						user: updated,
					});
				}

				/*
				 * Neuer Benutzer
				 */

				const result = await env.DB
					.prepare(
						`INSERT INTO users
							(minecraft_uuid, username, online)
						 VALUES (?, ?, 1)`
					)
					.bind(uuid, username)
					.run();

				const newUser = await env.DB
					.prepare(
						`SELECT id, minecraft_uuid, username, online, last_online, created_at
						 FROM users
						 WHERE minecraft_uuid = ?`
					)
					.bind(uuid)
					.first();

				return json({
					success: true,
					new_user: true,
					message: "Benutzer wurde registriert.",
					user: newUser,
					insert_id: result.meta.last_row_id,
				});
			}

			/*
			 * ==========================================
			 * API: ONLINE
			 * ==========================================
			 *
			 * POST /api/user/online
			 */

			if (
				path === "/api/user/online" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as OnlineRequest;

				if (!body.minecraft_uuid) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid ist erforderlich.",
						},
						400
					);
				}

				const uuid = normalizeUuid(body.minecraft_uuid);

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
					message: "Benutzer ist jetzt online.",
				});
			}

			/*
			 * ==========================================
			 * API: OFFLINE
			 * ==========================================
			 *
			 * POST /api/user/offline
			 */

			if (
				path === "/api/user/offline" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as OnlineRequest;

				if (!body.minecraft_uuid) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid ist erforderlich.",
						},
						400
					);
				}

				const uuid = normalizeUuid(body.minecraft_uuid);

				const result = await env.DB
					.prepare(
						`UPDATE users
						 SET online = 0,
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
					online: false,
					message: "Benutzer ist jetzt offline.",
				});
			}

			/*
			 * ==========================================
			 * API: ME
			 * ==========================================
			 *
			 * GET /api/user/me?uuid=...
			 */

			if (
				path === "/api/user/me" &&
				request.method === "GET"
			) {
				const uuidParam =
					url.searchParams.get("uuid");

				if (!uuidParam) {
					return json(
						{
							success: false,
							error: "uuid fehlt.",
						},
						400
					);
				}

				const uuid = normalizeUuid(uuidParam);

				const user = await env.DB
					.prepare(
						`SELECT
							id,
							minecraft_uuid,
							username,
							online,
							last_online,
							created_at
						 FROM users
						 WHERE minecraft_uuid = ?`
					)
					.bind(uuid)
					.first();

				if (!user) {
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
					user,
				});
			}

			/*
			 * ==========================================
			 * API: ONLINE PLAYER COUNT
			 * ==========================================
			 *
			 * GET /api/stats/online
			 */

			if (
				path === "/api/stats/online" &&
				request.method === "GET"
			) {
				/*
				 * Benutzer werden nach 2 Minuten
				 * automatisch als offline betrachtet.
				 *
				 * Dadurch bleiben Spieler nicht dauerhaft
				 * online, falls der Launcher abstürzt.
				 */

				await env.DB
					.prepare(
						`UPDATE users
						 SET online = 0
						 WHERE online = 1
						   AND last_online < unixepoch() - 120`
					)
					.run();

				const result = await env.DB
					.prepare(
						`SELECT COUNT(*) AS count
						 FROM users
						 WHERE online = 1`
					)
					.first<{ count: number }>();

				return json({
					success: true,
					online_players: result?.count ?? 0,
				});
			}

			/*
			 * ==========================================
			 * API: PLAYER SEARCH
			 * ==========================================
			 *
			 * GET /api/players/search?username=Steve
			 */

			if (
				path === "/api/players/search" &&
				request.method === "GET"
			) {
				const username =
					url.searchParams.get("username");

				if (!username || username.trim().length < 2) {
					return json(
						{
							success: false,
							error:
								"Mindestens 2 Zeichen eingeben.",
						},
						400
					);
				}

				/*
				 * Nach 2 Minuten Inaktivität offline setzen
				 */

				await env.DB
					.prepare(
						`UPDATE users
						 SET online = 0
						 WHERE online = 1
						   AND last_online < unixepoch() - 120`
					)
					.run();

				const search = `%${username.trim()}%`;

				const result = await env.DB
					.prepare(
						`SELECT
							username,
							minecraft_uuid,
							online,
							last_online
						 FROM users
						 WHERE username LIKE ?
						 ORDER BY
							online DESC,
							username ASC
						 LIMIT 20`
					)
					.bind(search)
					.all();

				return json({
					success: true,
					players: result.results,
				});
			}

			/*
			 * ==========================================
			 * API: ALL USERS
			 * ==========================================
			 *
			 * Nur zum Testen.
			 *
			 * GET /api/debug/users
			 */

			if (
				path === "/api/debug/users" &&
				request.method === "GET"
			) {
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
						 ORDER BY id DESC
						 LIMIT 100`
					)
					.all();

				return json({
					success: true,
					users: result.results,
				});
			}

			/*
			 * ==========================================
			 * STARTSEITE
			 * ==========================================
			 */

			if (path === "/" && request.method === "GET") {
				const result = await env.DB
					.prepare(
						`SELECT COUNT(*) AS count
						 FROM users
						 WHERE online = 1`
					)
					.first<{ count: number }>();

				const onlinePlayers =
					result?.count ?? 0;

				return new Response(
					`
					<!DOCTYPE html>
					<html lang="de">
					<head>
						<meta charset="UTF-8">
						<title>VoidClient Service</title>
						<style>
							body {
								background:#11151c;
								color:white;
								font-family:Arial,sans-serif;
								display:flex;
								align-items:center;
								justify-content:center;
								height:100vh;
								margin:0;
							}

							.box {
								background:#191f2a;
								border:1px solid #303949;
								border-radius:14px;
								padding:30px;
								width:420px;
								text-align:center;
							}

							.online {
								color:#35d07f;
								font-weight:bold;
							}

							code {
								background:#0d1117;
								padding:5px 8px;
								border-radius:5px;
							}
						</style>
					</head>

					<body>
						<div class="box">
							<h1>VoidClient</h1>

							<p class="online">
								● Launcher-Service online
							</p>

							<p>
								Online-Spieler:
								<strong>${onlinePlayers}</strong>
							</p>

							<p>
								API:
								<code>/api/health</code>
							</p>
						</div>
					</body>
					</html>
					`,
					{
						headers: {
							"content-type":
								"text/html; charset=UTF-8",
						},
					}
				);
			}

			/*
			 * ==========================================
			 * 404
			 * ==========================================
			 */

			return json(
				{
					success: false,
					error: "API-Endpunkt nicht gefunden.",
					path,
				},
				404
			);
		} catch (error) {
			console.error(error);

			return json(
				{
					success: false,
					error: "Interner Serverfehler.",
					details:
						error instanceof Error
							? error.message
							: String(error),
				},
				500
			);
		}
	},
} satisfies ExportedHandler<Env>;
