interface Env {
	DB: D1Database;
}

interface LoginRequest {
	uuid?: string;
	username?: string;
}

interface UserRequest {
	minecraft_uuid?: string;
	username?: string;
}

interface OnlineRequest {
	minecraft_uuid?: string;
	username?: string;
}

interface FriendRequestBody {
	user_id?: number;
	friend_id?: number;
}

interface BlockRequestBody {
	user_id?: number;
	blocked_user_id?: number;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=UTF-8",
			"access-control-allow-origin": "*",
			"access-control-allow-methods":
				"GET, POST, DELETE, OPTIONS",
			"access-control-allow-headers":
				"Content-Type",
		},
	});
}

function normalizeUsername(username: string): string {
	return username.trim();
}

function normalizeUuid(uuid: string): string {
	return uuid.trim().replace(/-/g, "").toLowerCase();
}

/*
 * ==========================================
 * REGISTER / LOGIN USER
 * ==========================================
 */

async function registerUser(
	env: Env,
	uuidInput: string,
	usernameInput: string
) {
	const uuid = normalizeUuid(uuidInput);
	const username = normalizeUsername(usernameInput);

	if (!uuid || !username) {
		return json(
			{
				success: false,
				error: "Ungültige Daten.",
			},
			400
		);
	}

	const existing = await env.DB
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

		const updated = await env.DB
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

		return json({
			success: true,
			new_user: false,
			message: "Benutzer aktualisiert.",
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

	const newUser = await env.DB
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

	return json({
		success: true,
		new_user: true,
		message: "Benutzer wurde registriert.",
		user: newUser,
		insert_id: result.meta.last_row_id,
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		try {
			/*
			 * ==========================================
			 * CORS
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
			 * HEALTH
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
			 * LOGIN
			 *
			 * POST /api/login
			 * ==========================================
			 */

			if (
				path === "/api/login" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as LoginRequest;

				if (!body.uuid || !body.username) {
					return json(
						{
							success: false,
							error:
								"uuid und username sind erforderlich.",
						},
						400
					);
				}

				return registerUser(
					env,
					body.uuid,
					body.username
				);
			}

			/*
			 * ==========================================
			 * REGISTER
			 * ==========================================
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

				return registerUser(
					env,
					body.minecraft_uuid,
					body.username
				);
			}

			/*
			 * ==========================================
			 * ONLINE
			 * ==========================================
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
				});
			}

			/*
			 * ==========================================
			 * OFFLINE
			 * ==========================================
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
				});
			}

			/*
			 * ==========================================
			 * GET USER
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
			 * SEARCH PLAYERS
			 *
			 * GET
			 * /api/players/search?username=Blue
			 * ==========================================
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

				const search =
					`%${username.trim()}%`;

				const result = await env.DB
					.prepare(
						`SELECT
							id,
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
			 * SEND FRIEND REQUEST
			 *
			 * POST /api/friends/request
			 *
			 * {
			 *   "sender_id": 1,
			 *   "receiver_id": 2
			 * }
			 * ==========================================
			 */

			if (
				path === "/api/friends/request" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as FriendRequestBody;

				if (
					!body.sender_id ||
					!body.receiver_id
				) {
					return json(
						{
							success: false,
							error:
								"sender_id und receiver_id sind erforderlich.",
						},
						400
					);
				}

				if (
					body.sender_id ===
					body.receiver_id
				) {
					return json(
						{
							success: false,
							error:
								"Du kannst dich nicht selbst hinzufügen.",
						},
						400
					);
				}

				const users = await env.DB
					.prepare(
						`SELECT id
						 FROM users
						 WHERE id IN (?, ?)`
					)
					.bind(
						body.sender_id,
						body.receiver_id
					)
					.all();

				if (users.results.length !== 2) {
					return json(
						{
							success: false,
							error:
								"Benutzer nicht gefunden.",
						},
						404
					);
				}

				/*
				 * Prüfen ob bereits Freunde
				 */

				const friendship = await env.DB
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
						body.sender_id,
						body.receiver_id,
						body.receiver_id,
						body.sender_id
					)
					.first();

				if (friendship) {
					return json(
						{
							success: false,
							error:
								"Ihr seid bereits Freunde.",
						},
						409
					);
				}

				/*
				 * Prüfen ob bereits Anfrage existiert
				 */

				const existingRequest =
					await env.DB
						.prepare(
							`SELECT id, status
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
							body.sender_id,
							body.receiver_id,
							body.receiver_id,
							body.sender_id
						)
						.first();

				if (existingRequest) {
					return json(
						{
							success: false,
							error:
								"Es existiert bereits eine Freundschaftsanfrage.",
							request: existingRequest,
						},
						409
					);
				}

				const result = await env.DB
					.prepare(
						`INSERT INTO friend_requests
							(sender_id, receiver_id, status)
						 VALUES (?, ?, 'pending')`
					)
					.bind(
						body.sender_id,
						body.receiver_id
					)
					.run();

				/*
				 * Inbox Nachricht
				 */

				const sender = await env.DB
					.prepare(
						`SELECT username
						 FROM users
						 WHERE id = ?`
					)
					.bind(body.sender_id)
					.first<{ username: string }>();

				await env.DB
					.prepare(
						`INSERT INTO inbox
							(user_id, type, title, message)
						 VALUES (?, ?, ?, ?)`
					)
					.bind(
						body.receiver_id,
						"friend_request",
						"Neue Freundschaftsanfrage",
						`${sender?.username ?? "Ein Spieler"} möchte dich als Freund hinzufügen.`
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
			 * GET FRIEND REQUESTS
			 *
			 * GET /api/friends/requests?user_id=1
			 * ==========================================
			 */

			if (
				path === "/api/friends/requests" &&
				request.method === "GET"
			) {
				const userId =
					Number(
						url.searchParams.get(
							"user_id"
						)
					);

				if (!userId) {
					return json(
						{
							success: false,
							error:
								"user_id fehlt.",
						},
						400
					);
				}

				const result = await env.DB
					.prepare(
						`SELECT
							fr.id,
							fr.sender_id,
							u.username,
							u.minecraft_uuid,
							u.online,
							fr.created_at
						 FROM friend_requests fr
						 JOIN users u
							ON u.id = fr.sender_id
						 WHERE
							fr.receiver_id = ?
							AND fr.status = 'pending'
						 ORDER BY fr.created_at DESC`
					)
					.bind(userId)
					.all();

				return json({
					success: true,
					requests: result.results,
				});
			}

			/*
			 * ==========================================
			 * ACCEPT FRIEND REQUEST
			 *
			 * POST /api/friends/accept
			 *
			 * {
			 *   "user_id": 2,
			 *   "request_id": 5
			 * }
			 * ==========================================
			 */

			if (
				path === "/api/friends/accept" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as {
						user_id?: number;
						request_id?: number;
					};

				if (
					!body.user_id ||
					!body.request_id
				) {
					return json(
						{
							success: false,
							error:
								"user_id und request_id sind erforderlich.",
						},
						400
					);
				}

				const requestData =
					await env.DB
						.prepare(
							`SELECT
								id,
								sender_id,
								receiver_id
							 FROM friend_requests
							 WHERE
								id = ?
								AND receiver_id = ?
								AND status = 'pending'`
						)
						.bind(
							body.request_id,
							body.user_id
						)
						.first<{
							id: number;
							sender_id: number;
							receiver_id: number;
						}>();

				if (!requestData) {
					return json(
						{
							success: false,
							error:
								"Freundschaftsanfrage nicht gefunden.",
						},
						404
					);
				}

				/*
				 * Freundschaft in beide Richtungen
				 */

				await env.DB
					.prepare(
						`INSERT OR IGNORE INTO friendships
							(user_id, friend_id)
						 VALUES (?, ?), (?, ?)`
					)
					.bind(
						requestData.sender_id,
						requestData.receiver_id,
						requestData.receiver_id,
						requestData.sender_id
					)
					.run();

				await env.DB
					.prepare(
						`UPDATE friend_requests
						 SET status = 'accepted'
						 WHERE id = ?`
					)
					.bind(body.request_id)
					.run();

				const receiver =
					await env.DB
						.prepare(
							`SELECT username
							 FROM users
							 WHERE id = ?`
						)
						.bind(
							requestData.receiver_id
						)
						.first<{
							username: string;
						}>();

				await env.DB
					.prepare(
						`INSERT INTO inbox
							(user_id, type, title, message)
						 VALUES (?, ?, ?, ?)`
					)
					.bind(
						requestData.sender_id,
						"friend_accepted",
						"Freundschaftsanfrage angenommen",
						`${receiver?.username ?? "Der Spieler"} hat deine Freundschaftsanfrage angenommen.`
					)
					.run();

				return json({
					success: true,
					message:
						"Ihr seid jetzt Freunde.",
				});
			}

			/*
			 * ==========================================
			 * DECLINE FRIEND REQUEST
			 *
			 * POST /api/friends/decline
			 *
			 * {
			 *   "user_id": 2,
			 *   "request_id": 5
			 * }
			 * ==========================================
			 */

			if (
				path === "/api/friends/decline" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as {
						user_id?: number;
						request_id?: number;
					};

				if (
					!body.user_id ||
					!body.request_id
				) {
					return json(
						{
							success: false,
							error:
								"user_id und request_id sind erforderlich.",
						},
						400
					);
				}

				const result = await env.DB
					.prepare(
						`UPDATE friend_requests
						 SET status = 'declined'
						 WHERE
							id = ?
							AND receiver_id = ?
							AND status = 'pending'`
					)
					.bind(
						body.request_id,
						body.user_id
					)
					.run();

				if (result.meta.changes === 0) {
					return json(
						{
							success: false,
							error:
								"Freundschaftsanfrage nicht gefunden.",
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
			 *
			 * GET /api/friends?user_id=1
			 * ==========================================
			 */

			if (
				path === "/api/friends" &&
				request.method === "GET"
			) {
				const userId =
					Number(
						url.searchParams.get(
							"user_id"
						)
					);

				if (!userId) {
					return json(
						{
							success: false,
							error:
								"user_id fehlt.",
						},
						400
					);
				}

				const result = await env.DB
					.prepare(
						`SELECT
							u.id,
							u.username,
							u.minecraft_uuid,
							u.online,
							u.last_online,
							f.friends_since
						 FROM friendships f
						 JOIN users u
							ON u.id = f.friend_id
						 WHERE f.user_id = ?
						 ORDER BY
							u.online DESC,
							u.username ASC`
					)
					.bind(userId)
					.all();

				return json({
					success: true,
					friends: result.results,
				});
			}

			/*
			 * ==========================================
			 * REMOVE FRIEND
			 *
			 * DELETE
			 * /api/friends?user_id=1&friend_id=2
			 * ==========================================
			 */

			if (
				path === "/api/friends" &&
				request.method === "DELETE"
			) {
				const userId =
					Number(
						url.searchParams.get(
							"user_id"
						)
					);

				const friendId =
					Number(
						url.searchParams.get(
							"friend_id"
						)
					);

				if (!userId || !friendId) {
					return json(
						{
							success: false,
							error:
								"user_id und friend_id sind erforderlich.",
						},
						400
					);
				}

				await env.DB
					.prepare(
						`DELETE FROM friendships
						 WHERE
							(user_id = ? AND friend_id = ?)
							OR
							(user_id = ? AND friend_id = ?)`
					)
					.bind(
						userId,
						friendId,
						friendId,
						userId
					)
					.run();

				return json({
					success: true,
					message:
						"Freund entfernt.",
				});
			}

			/*
			 * ==========================================
			 * BLOCK USER
			 *
			 * POST /api/block
			 * ==========================================
			 */

			if (
				path === "/api/block" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as BlockRequestBody;

				if (
					!body.user_id ||
					!body.blocked_user_id
				) {
					return json(
						{
							success: false,
							error:
								"user_id und blocked_user_id sind erforderlich.",
						},
						400
					);
				}

				if (
					body.user_id ===
					body.blocked_user_id
				) {
					return json(
						{
							success: false,
							error:
								"Du kannst dich nicht selbst blockieren.",
						},
						400
					);
				}

				await env.DB
					.prepare(
						`INSERT OR IGNORE INTO blocked_users
							(user_id, blocked_user_id)
						 VALUES (?, ?)`
					)
					.bind(
						body.user_id,
						body.blocked_user_id
					)
					.run();

				/*
				 * Freundschaft gleichzeitig entfernen
				 */

				await env.DB
					.prepare(
						`DELETE FROM friendships
						 WHERE
							(user_id = ? AND friend_id = ?)
							OR
							(user_id = ? AND friend_id = ?)`
					)
					.bind(
						body.user_id,
						body.blocked_user_id,
						body.blocked_user_id,
						body.user_id
					)
					.run();

				return json({
					success: true,
					message:
						"Benutzer blockiert.",
				});
			}

			/*
			 * ==========================================
			 * UNBLOCK USER
			 *
			 * DELETE /api/block
			 * ==========================================
			 */

			if (
				path === "/api/block" &&
				request.method === "DELETE"
			) {
				const userId =
					Number(
						url.searchParams.get(
							"user_id"
						)
					);

				const blockedUserId =
					Number(
						url.searchParams.get(
							"blocked_user_id"
						)
					);

				if (
					!userId ||
					!blockedUserId
				) {
					return json(
						{
							success: false,
							error:
								"user_id und blocked_user_id sind erforderlich.",
						},
						400
					);
				}

				await env.DB
					.prepare(
						`DELETE FROM blocked_users
						 WHERE
							user_id = ?
							AND blocked_user_id = ?`
					)
					.bind(
						userId,
						blockedUserId
					)
					.run();

				return json({
					success: true,
					message:
						"Benutzer entblockiert.",
				});
			}

			/*
			 * ==========================================
			 * INBOX
			 *
			 * GET /api/inbox?user_id=1
			 * ==========================================
			 */

			if (
				path === "/api/inbox" &&
				request.method === "GET"
			) {
				const userId =
					Number(
						url.searchParams.get(
							"user_id"
						)
					);

				if (!userId) {
					return json(
						{
							success: false,
							error:
								"user_id fehlt.",
						},
						400
					);
				}

				const result = await env.DB
					.prepare(
						`SELECT
							id,
							type,
							title,
							message,
							is_read,
							created_at
						 FROM inbox
						 WHERE user_id = ?
						 ORDER BY created_at DESC
						 LIMIT 50`
					)
					.bind(userId)
					.all();

				return json({
					success: true,
					messages: result.results,
				});
			}

			/*
			 * ==========================================
			 * MARK INBOX MESSAGE READ
			 *
			 * POST /api/inbox/read
			 *
			 * {
			 *   "user_id": 1,
			 *   "message_id": 5
			 * }
			 * ==========================================
			 */

			if (
				path === "/api/inbox/read" &&
				request.method === "POST"
			) {
				const body =
					(await request.json()) as {
						user_id?: number;
						message_id?: number;
					};

				if (
					!body.user_id ||
					!body.message_id
				) {
					return json(
						{
							success: false,
							error:
								"user_id und message_id sind erforderlich.",
						},
						400
					);
				}

				await env.DB
					.prepare(
						`UPDATE inbox
						 SET is_read = 1
						 WHERE
							id = ?
							AND user_id = ?`
					)
					.bind(
						body.message_id,
						body.user_id
					)
					.run();

				return json({
					success: true,
				});
			}

			/*
			 * ==========================================
			 * DEBUG USERS
			 * ==========================================
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

			if (
				path === "/" &&
				request.method === "GET"
			) {
				const result = await env.DB
					.prepare(
						`SELECT COUNT(*) AS count
						 FROM users
						 WHERE online = 1`
					)
					.first<{ count: number }>();

				return new Response(
					`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>VoidClient</title>
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
<p class="online">● Launcher-Service online</p>
<p>
Online-Spieler:
<strong>${result?.count ?? 0}</strong>
</p>
<p>API: <code>/api/health</code></p>
</div>
</body>
</html>`,
					{
						headers: {
							"content-type":
								"text/html; charset=UTF-8",
						},
					}
				);
			}

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
