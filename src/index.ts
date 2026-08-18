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

interface FriendRequest {
	minecraft_uuid?: string;
	friend_uuid?: string;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=UTF-8",
			"access-control-allow-origin": "*",
			"access-control-allow-methods":
				"GET, POST, DELETE, OPTIONS",
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

async function getUserByUuid(
	db: D1Database,
	uuid: string
) {
	return await db
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
						"access-control-allow-headers":
							"Content-Type",
					},
				});
			}

			const url = new URL(request.url);
			const path = url.pathname;

			/*
			 * ==========================================
			 * HEALTHww
			 * ==========================================
			 */

			if (
				path === "/api/health" &&
				request.method === "GET"
			) {
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
			 * USER REGISTER / LOGIN
			 * ==========================================
			 *
			 * POST /api/user/register
			 */

			if (
				path === "/api/user/register" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as UserRequest;

				if (
					!body.minecraft_uuid ||
					!body.username
				) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid und username sind erforderlich.",
						},
						400
					);
				}

				const uuid = normalizeUuid(
					body.minecraft_uuid
				);

				const username = normalizeUsername(
					body.username
				);

				if (!uuid || !username) {
					return json(
						{
							success: false,
							error: "Ungültige Daten.",
						},
						400
					);
				}

				const existing =
					await getUserByUuid(env.DB, uuid);

				if (existing) {
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

					const updated =
						await getUserByUuid(env.DB, uuid);

					return json({
						success: true,
						new_user: false,
						message:
							"Benutzer aktualisiert.",
						user: updated,
					});
				}

				const result = await env.DB
					.prepare(
						`INSERT INTO users
							(minecraft_uuid, username, online)
						 VALUES (?, ?, 1)`
					)
					.bind(uuid, username)
					.run();

				const newUser =
					await getUserByUuid(env.DB, uuid);

				return json({
					success: true,
					new_user: true,
					message:
						"Benutzer wurde registriert.",
					user: newUser,
					insert_id:
						result.meta.last_row_id,
				});
			}

			/*
			 * ==========================================
			 * USER ONLINE
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

				const uuid = normalizeUuid(
					body.minecraft_uuid
				);

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
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				return json({
					success: true,
					online: true,
					message:
						"Benutzer ist jetzt online.",
				});
			}

			/*
			 * ==========================================
			 * USER OFFLINE
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

				const uuid = normalizeUuid(
					body.minecraft_uuid
				);

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
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				return json({
					success: true,
					online: false,
					message:
						"Benutzer ist jetzt offline.",
				});
			}

			/*
			 * ==========================================
			 * USER ME
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

				const uuid =
					normalizeUuid(uuidParam);

				const user =
					await getUserByUuid(
						env.DB,
						uuid
					);

				if (!user) {
					return json(
						{
							success: false,
							error:
								"Benutzer nicht gefunden.",
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
			 * ONLINE PLAYER COUNT
			 * ==========================================
			 *
			 * GET /api/stats/online
			 */

			if (
				path === "/api/stats/online" &&
				request.method === "GET"
			) {
				await env.DB
					.prepare(
						`UPDATE users
						 SET online = 0
						 WHERE online = 1
						   AND last_online <
						       unixepoch() - 120`
					)
					.run();

				const result =
					await env.DB
						.prepare(
							`SELECT COUNT(*) AS count
							 FROM users
							 WHERE online = 1`
						)
						.first<{ count: number }>();

				return json({
					success: true,
					online_players:
						result?.count ?? 0,
				});
			}

			/*
			 * ==========================================
			 * PLAYER SEARCH
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

				if (
					!username ||
					username.trim().length < 2
				) {
					return json(
						{
							success: false,
							error:
								"Mindestens 2 Zeichen eingeben.",
						},
						400
					);
				}

				await env.DB
					.prepare(
						`UPDATE users
						 SET online = 0
						 WHERE online = 1
						   AND last_online <
						       unixepoch() - 120`
					)
					.run();

				const search =
					`%${username.trim()}%`;

				const result =
					await env.DB
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
			 * FRIEND REQUEST SEND
			 * ==========================================
			 *
			 * POST /api/friends/request
			 *
			 * {
			 *   "minecraft_uuid": "ME",
			 *   "friend_uuid": "TARGET"
			 * }
			 */

			if (
				path === "/api/friends/request" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as FriendRequest;

				if (
					!body.minecraft_uuid ||
					!body.friend_uuid
				) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid und friend_uuid sind erforderlich.",
						},
						400
					);
				}

				const senderUuid =
					normalizeUuid(
						body.minecraft_uuid
					);

				const receiverUuid =
					normalizeUuid(
						body.friend_uuid
					);

				if (senderUuid === receiverUuid) {
					return json(
						{
							success: false,
							error:
								"Du kannst dich nicht selbst als Freund hinzufügen.",
						},
						400
					);
				}

				const sender =
					await getUserByUuid(
						env.DB,
						senderUuid
					);

				const receiver =
					await getUserByUuid(
						env.DB,
						receiverUuid
					);

				if (!sender) {
					return json(
						{
							success: false,
							error:
								"Sender nicht gefunden.",
						},
						404
					);
				}

				if (!receiver) {
					return json(
						{
							success: false,
							error:
								"Spieler nicht gefunden.",
						},
						404
					);
				}

				const friendship =
					await env.DB
						.prepare(
							`SELECT 1
							 FROM friendships
							 WHERE
								(user_id = ? AND friend_id = ?)
								OR
								(user_id = ? AND friend_id = ?)
							 LIMIT 1`
						)
						.bind(
							sender.id,
							receiver.id,
							receiver.id,
							sender.id
						)
						.first();

				if (friendship) {
					return json(
						{
							success: false,
							error:
								"Ihr seid bereits befreundet.",
						},
						409
					);
				}

				const existingRequest =
					await env.DB
						.prepare(
							`SELECT *
							 FROM friend_requests
							 WHERE
								(
									sender_id = ?
									AND receiver_id = ?
								)
								OR
								(
									sender_id = ?
									AND receiver_id = ?
								)
							 LIMIT 1`
						)
						.bind(
							sender.id,
							receiver.id,
							receiver.id,
							sender.id
						)
						.first();

				if (existingRequest) {
					return json(
						{
							success: false,
							error:
								"Es existiert bereits eine Freundschaftsanfrage.",
						},
						409
					);
				}

				const result =
					await env.DB
						.prepare(
							`INSERT INTO friend_requests
								(sender_id, receiver_id, status)
							 VALUES (?, ?, 'pending')`
						)
						.bind(
							sender.id,
							receiver.id
						)
						.run();

				return json({
					success: true,
					message:
						"Freundschaftsanfrage gesendet.",
					request_id:
						result.meta.last_row_id,
				});
			}

			/*
			 * ==========================================
			 * FRIEND REQUESTS
			 * ==========================================
			 *
			 * GET /api/friends/requests?uuid=...
			 */

			if (
				path === "/api/friends/requests" &&
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

				const uuid =
					normalizeUuid(uuidParam);

				const user =
					await getUserByUuid(
						env.DB,
						uuid
					);

				if (!user) {
					return json(
						{
							success: false,
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				const result =
					await env.DB
						.prepare(
							`SELECT
								fr.id,
								fr.status,
								fr.created_at,
								u.username AS sender_username,
								u.minecraft_uuid AS sender_uuid
							 FROM friend_requests fr
							 INNER JOIN users u
								ON u.id = fr.sender_id
							 WHERE
								fr.receiver_id = ?
								AND fr.status = 'pending'
							 ORDER BY fr.created_at DESC`
						)
						.bind(user.id)
						.all();

				return json({
					success: true,
					requests: result.results,
				});
			}

			/*
			 * ==========================================
			 * FRIEND REQUEST ACCEPT
			 * ==========================================
			 *
			 * POST /api/friends/accept
			 *
			 * {
			 *   "minecraft_uuid": "RECEIVER",
			 *   "friend_uuid": "SENDER"
			 * }
			 */

			if (
				path === "/api/friends/accept" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as FriendRequest;

				if (
					!body.minecraft_uuid ||
					!body.friend_uuid
				) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid und friend_uuid sind erforderlich.",
						},
						400
					);
				}

				const receiverUuid =
					normalizeUuid(
						body.minecraft_uuid
					);

				const senderUuid =
					normalizeUuid(
						body.friend_uuid
					);

				const receiver =
					await getUserByUuid(
						env.DB,
						receiverUuid
					);

				const sender =
					await getUserByUuid(
						env.DB,
						senderUuid
					);

				if (!receiver || !sender) {
					return json(
						{
							success: false,
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				const requestRow =
					await env.DB
						.prepare(
							`SELECT id
							 FROM friend_requests
							 WHERE
								sender_id = ?
								AND receiver_id = ?
								AND status = 'pending'
							 LIMIT 1`
						)
						.bind(
							sender.id,
							receiver.id
						)
						.first<{ id: number }>();

				if (!requestRow) {
					return json(
						{
							success: false,
							error:
								"Keine offene Freundschaftsanfrage gefunden.",
						},
						404
					);
				}

				await env.DB
					.prepare(
						`INSERT INTO friendships
							(user_id, friend_id)
						 VALUES (?, ?), (?, ?)`
					)
					.bind(
						receiver.id,
						sender.id,
						sender.id,
						receiver.id
					)
					.run();

				await env.DB
					.prepare(
						`UPDATE friend_requests
						 SET status = 'accepted'
						 WHERE id = ?`
					)
					.bind(requestRow.id)
					.run();

				return json({
					success: true,
					message:
						"Freundschaftsanfrage angenommen.",
				});
			}

			/*
			 * ==========================================
			 * FRIEND REQUEST DECLINE
			 * ==========================================
			 *
			 * POST /api/friends/decline
			 */

			if (
				path === "/api/friends/decline" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as FriendRequest;

				if (
					!body.minecraft_uuid ||
					!body.friend_uuid
				) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid und friend_uuid sind erforderlich.",
						},
						400
					);
				}

				const receiver =
					await getUserByUuid(
						env.DB,
						normalizeUuid(
							body.minecraft_uuid
						)
					);

				const sender =
					await getUserByUuid(
						env.DB,
						normalizeUuid(
							body.friend_uuid
						)
					);

				if (!receiver || !sender) {
					return json(
						{
							success: false,
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				const result =
					await env.DB
						.prepare(
							`UPDATE friend_requests
							 SET status = 'declined'
							 WHERE
								sender_id = ?
								AND receiver_id = ?
								AND status = 'pending'`
						)
						.bind(
							sender.id,
							receiver.id
						)
						.run();

				if (result.meta.changes === 0) {
					return json(
						{
							success: false,
							error:
								"Keine offene Anfrage gefunden.",
						},
						404
					);
				}

				return json({
					success: true,
					message:
						"Freundschaftsanfrage abgelehnt.",
				});
			}

			/*
			 * ==========================================
			 * FRIEND LIST
			 * ==========================================
			 *
			 * GET /api/friends?uuid=...
			 */

			if (
				path === "/api/friends" &&
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

				const user =
					await getUserByUuid(
						env.DB,
						normalizeUuid(uuidParam)
					);

				if (!user) {
					return json(
						{
							success: false,
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				await env.DB
					.prepare(
						`UPDATE users
						 SET online = 0
						 WHERE online = 1
						   AND last_online <
						       unixepoch() - 120`
					)
					.run();

				const result =
					await env.DB
						.prepare(
							`SELECT
								u.username,
								u.minecraft_uuid,
								u.online,
								u.last_online,
								f.friends_since
							 FROM friendships f
							 INNER JOIN users u
								ON u.id = f.friend_id
							 WHERE f.user_id = ?
							 ORDER BY
								u.online DESC,
								u.username ASC`
						)
						.bind(user.id)
						.all();

				return json({
					success: true,
					friends: result.results,
				});
			}

			/*
			 * ==========================================
			 * REMOVE FRIEND
			 * ==========================================
			 *
			 * DELETE /api/friends/remove
			 *
			 * Body:
			 * {
			 *   "minecraft_uuid": "ME",
			 *   "friend_uuid": "FRIEND"
			 * }
			 */

			if (
				path === "/api/friends/remove" &&
				request.method === "DELETE"
			) {
				const body =
					(await request.json()) as FriendRequest;

				if (
					!body.minecraft_uuid ||
					!body.friend_uuid
				) {
					return json(
						{
							success: false,
							error:
								"minecraft_uuid und friend_uuid sind erforderlich.",
						},
						400
					);
				}

				const user =
					await getUserByUuid(
						env.DB,
						normalizeUuid(
							body.minecraft_uuid
						)
					);

				const friend =
					await getUserByUuid(
						env.DB,
						normalizeUuid(
							body.friend_uuid
						)
					);

				if (!user || !friend) {
					return json(
						{
							success: false,
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				const result =
					await env.DB
						.prepare(
							`DELETE FROM friendships
							 WHERE
								(user_id = ? AND friend_id = ?)
								OR
								(user_id = ? AND friend_id = ?)`
						)
						.bind(
							user.id,
							friend.id,
							friend.id,
							user.id
						)
						.run();

				if (result.meta.changes === 0) {
					return json(
						{
							success: false,
							error:
								"Ihr seid nicht befreundet.",
						},
						404
					);
				}

				return json({
					success: true,
					message:
						"Freund wurde entfernt.",
				});
			}

			/*
			 * ==========================================
			 * DEBUG USERS
			 * ==========================================
			 *
			 * GET /api/debug/users
			 */

			if (
				path === "/api/debug/users" &&
				request.method === "GET"
			) {
				const result =
					await env.DB
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
			 * DEBUG FRIEND REQUESTS
			 * ==========================================
			 *
			 * GET /api/debug/friend-requests
			 */

			if (
				path ===
					"/api/debug/friend-requests" &&
				request.method === "GET"
			) {
				const result =
					await env.DB
						.prepare(
							`SELECT
								fr.id,
								fr.status,
								fr.created_at,
								s.username AS sender,
								r.username AS receiver
							 FROM friend_requests fr
							 INNER JOIN users s
								ON s.id = fr.sender_id
							 INNER JOIN users r
								ON r.id = fr.receiver_id
							 ORDER BY fr.id DESC
							 LIMIT 100`
						)
						.all();

				return json({
					success: true,
					requests: result.results,
				});
			}

			/*
			 * ==========================================
			 * DEBUG FRIENDSHIPS
			 * ==========================================
			 *
			 * GET /api/debug/friendships
			 */

			if (
				path === "/api/debug/friendships" &&
				request.method === "GET"
			) {
				const result =
					await env.DB
						.prepare(
							`SELECT
								f.user_id,
								u1.username AS username,
								f.friend_id,
								u2.username AS friend_username,
								f.friends_since
							 FROM friendships f
							 INNER JOIN users u1
								ON u1.id = f.user_id
							 INNER JOIN users u2
								ON u2.id = f.friend_id
							 ORDER BY f.friends_since DESC
							 LIMIT 100`
						)
						.all();

				return json({
					success: true,
					friendships: result.results,
				});
			}

			/*
			 * ==========================================
			 * STARTSEITE
			 * ==========================================
			 */

			if (
				path === "/" &&
				request.method === "GET"
			) {
				const result =
					await env.DB
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
								<strong>
									${onlinePlayers}
								</strong>
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
					error:
						"API-Endpunkt nicht gefunden.",
					path,
				},
				404
			);
		} catch (error) {
			console.error(error);

			return json(
				{
					success: false,
					error:
						"Interner Serverfehler.",
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
