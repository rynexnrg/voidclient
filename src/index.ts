interface Env {
	DB: D1Database;
}

interface UserRequest {
	minecraft_uuid?: string;
	username?: string;
}

interface FriendRequestBody {
	minecraft_uuid?: string;
	friend_uuid?: string;
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

function normalizeUuid(uuid: string): string {
	return uuid.trim().replace(/-/g, "").toLowerCase();
}

function normalizeUsername(username: string): string {
	return username.trim();
}

export default {
	async fetch(request, env): Promise<Response> {
		try {
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
			 * HEALTH
			 * ==========================================
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
			 * REGISTER / UPDATE USER
			 * ==========================================
			 */

			if (
				path === "/api/user/register" &&
				request.method === "POST"
			) {
				const body = (await request.json()) as UserRequest;

				if (!body.minecraft_uuid || !body.username) {
					return json({
						success: false,
						error: "minecraft_uuid und username sind erforderlich.",
					}, 400);
				}

				const uuid = normalizeUuid(body.minecraft_uuid);
				const username = normalizeUsername(body.username);

				const existing = await env.DB
					.prepare(`
						SELECT *
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.first();

				if (existing) {
					await env.DB
						.prepare(`
							UPDATE users
							SET username = ?,
								online = 1,
								last_online = unixepoch()
							WHERE minecraft_uuid = ?
						`)
						.bind(username, uuid)
						.run();

					const updated = await env.DB
						.prepare(`
							SELECT *
							FROM users
							WHERE minecraft_uuid = ?
						`)
						.bind(uuid)
						.first();

					return json({
						success: true,
						new_user: false,
						user: updated,
					});
				}

				const result = await env.DB
					.prepare(`
						INSERT INTO users
						(minecraft_uuid, username, online)
						VALUES (?, ?, 1)
					`)
					.bind(uuid, username)
					.run();

				const user = await env.DB
					.prepare(`
						SELECT *
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.first();

				return json({
					success: true,
					new_user: true,
					user,
					insert_id: result.meta.last_row_id,
				});
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
				const body = (await request.json()) as UserRequest;

				if (!body.minecraft_uuid) {
					return json({
						success: false,
						error: "minecraft_uuid fehlt.",
					}, 400);
				}

				const uuid = normalizeUuid(body.minecraft_uuid);

				const result = await env.DB
					.prepare(`
						UPDATE users
						SET online = 1,
							last_online = unixepoch()
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.run();

				if (result.meta.changes === 0) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
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
				const body = (await request.json()) as UserRequest;

				if (!body.minecraft_uuid) {
					return json({
						success: false,
						error: "minecraft_uuid fehlt.",
					}, 400);
				}

				const uuid = normalizeUuid(body.minecraft_uuid);

				const result = await env.DB
					.prepare(`
						UPDATE users
						SET online = 0,
							last_online = unixepoch()
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.run();

				if (result.meta.changes === 0) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				return json({
					success: true,
					online: false,
				});
			}

			/*
			 * ==========================================
			 * USER ME
			 * ==========================================
			 */

			if (
				path === "/api/user/me" &&
				request.method === "GET"
			) {
				const uuidParam = url.searchParams.get("uuid");

				if (!uuidParam) {
					return json({
						success: false,
						error: "uuid fehlt.",
					}, 400);
				}

				const uuid = normalizeUuid(uuidParam);

				const user = await env.DB
					.prepare(`
						SELECT *
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.first();

				if (!user) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				return json({
					success: true,
					user,
				});
			}

			/*
			 * ==========================================
			 * PLAYER SEARCH
			 * ==========================================
			 *
			 * GET
			 * /api/players/search?username=Blue
			 */

			if (
				path === "/api/players/search" &&
				request.method === "GET"
			) {
				const username = url.searchParams.get("username");

				if (!username || username.trim().length < 2) {
					return json({
						success: false,
						error: "Mindestens 2 Zeichen eingeben.",
					}, 400);
				}

				const search = `%${username.trim()}%`;

				const result = await env.DB
					.prepare(`
						SELECT
							username,
							minecraft_uuid,
							online,
							last_online
						FROM users
						WHERE username LIKE ?
						ORDER BY online DESC, username ASC
						LIMIT 20
					`)
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
			 * ==========================================
			 *
			 * POST /api/friends/request
			 *
			 * {
			 *   "minecraft_uuid": "USER_A",
			 *   "friend_uuid": "USER_B"
			 * }
			 */

			if (
				path === "/api/friends/request" &&
				request.method === "POST"
			) {
				const body = (await request.json()) as FriendRequestBody;

				if (!body.minecraft_uuid || !body.friend_uuid) {
					return json({
						success: false,
						error: "minecraft_uuid und friend_uuid sind erforderlich.",
					}, 400);
				}

				const senderUuid = normalizeUuid(body.minecraft_uuid);
				const receiverUuid = normalizeUuid(body.friend_uuid);

				if (senderUuid === receiverUuid) {
					return json({
						success: false,
						error: "Du kannst dir selbst keine Freundschaftsanfrage senden.",
					}, 400);
				}

				const sender = await env.DB
					.prepare(`
						SELECT id, username
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(senderUuid)
					.first<{ id: number; username: string }>();

				const receiver = await env.DB
					.prepare(`
						SELECT id, username
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(receiverUuid)
					.first<{ id: number; username: string }>();

				if (!sender || !receiver) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				const friendship = await env.DB
					.prepare(`
						SELECT *
						FROM friendships
						WHERE
							(user_id = ? AND friend_id = ?)
							OR
							(user_id = ? AND friend_id = ?)
					`)
					.bind(
						sender.id,
						receiver.id,
						receiver.id,
						sender.id
					)
					.first();

				if (friendship) {
					return json({
						success: false,
						error: "Ihr seid bereits befreundet.",
					}, 400);
				}

				const existingRequest = await env.DB
					.prepare(`
						SELECT *
						FROM friend_requests
						WHERE
							(
								sender_id = ?
								AND receiver_id = ?
								AND status = 'pending'
							)
							OR
							(
								sender_id = ?
								AND receiver_id = ?
								AND status = 'pending'
							)
					`)
					.bind(
						sender.id,
						receiver.id,
						receiver.id,
						sender.id
					)
					.first();

				if (existingRequest) {
					return json({
						success: false,
						error: "Es existiert bereits eine Freundschaftsanfrage.",
					}, 400);
				}

				await env.DB
					.prepare(`
						INSERT INTO friend_requests
						(sender_id, receiver_id, status)
						VALUES (?, ?, 'pending')
					`)
					.bind(sender.id, receiver.id)
					.run();

				await env.DB
					.prepare(`
						INSERT INTO inbox
						(user_id, type, title, message)
						VALUES (?, ?, ?, ?)
					`)
					.bind(
						receiver.id,
						"friend_request",
						"Neue Freundschaftsanfrage",
						`${sender.username} möchte dich als Freund hinzufügen.`
					)
					.run();

				return json({
					success: true,
					message: "Freundschaftsanfrage gesendet.",
				});
			}

			/*
			 * ==========================================
			 * GET FRIEND REQUESTS
			 * ==========================================
			 *
			 * GET /api/friends/requests?uuid=...
			 */

			if (
				path === "/api/friends/requests" &&
				request.method === "GET"
			) {
				const uuidParam = url.searchParams.get("uuid");

				if (!uuidParam) {
					return json({
						success: false,
						error: "uuid fehlt.",
					}, 400);
				}

				const uuid = normalizeUuid(uuidParam);

				const user = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.first<{ id: number }>();

				if (!user) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				const result = await env.DB
					.prepare(`
						SELECT
							fr.id,
							u.username,
							u.minecraft_uuid,
							fr.created_at
						FROM friend_requests fr
						JOIN users u
							ON u.id = fr.sender_id
						WHERE fr.receiver_id = ?
							AND fr.status = 'pending'
						ORDER BY fr.created_at DESC
					`)
					.bind(user.id)
					.all();

				return json({
					success: true,
					requests: result.results,
				});
			}

			/*
			 * ==========================================
			 * ACCEPT FRIEND REQUEST
			 * ==========================================
			 *
			 * POST /api/friends/accept
			 *
			 * {
			 *   "minecraft_uuid": "receiver",
			 *   "friend_uuid": "sender"
			 * }
			 */

			if (
				path === "/api/friends/accept" &&
				request.method === "POST"
			) {
				const body = (await request.json()) as FriendRequestBody;

				if (!body.minecraft_uuid || !body.friend_uuid) {
					return json({
						success: false,
						error: "minecraft_uuid und friend_uuid sind erforderlich.",
					}, 400);
				}

				const receiverUuid = normalizeUuid(body.minecraft_uuid);
				const senderUuid = normalizeUuid(body.friend_uuid);

				const receiver = await env.DB
					.prepare(`
						SELECT id, username
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(receiverUuid)
					.first<{ id: number; username: string }>();

				const sender = await env.DB
					.prepare(`
						SELECT id, username
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(senderUuid)
					.first<{ id: number; username: string }>();

				if (!receiver || !sender) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				const requestRow = await env.DB
					.prepare(`
						SELECT id
						FROM friend_requests
						WHERE sender_id = ?
							AND receiver_id = ?
							AND status = 'pending'
					`)
					.bind(sender.id, receiver.id)
					.first<{ id: number }>();

				if (!requestRow) {
					return json({
						success: false,
						error: "Freundschaftsanfrage nicht gefunden.",
					}, 404);
				}

				await env.DB
					.prepare(`
						UPDATE friend_requests
						SET status = 'accepted'
						WHERE id = ?
					`)
					.bind(requestRow.id)
					.run();

				await env.DB
					.prepare(`
						INSERT OR IGNORE INTO friendships
						(user_id, friend_id)
						VALUES (?, ?)
					`)
					.bind(receiver.id, sender.id)
					.run();

				await env.DB
					.prepare(`
						INSERT OR IGNORE INTO friendships
						(user_id, friend_id)
						VALUES (?, ?)
					`)
					.bind(sender.id, receiver.id)
					.run();

				await env.DB
					.prepare(`
						INSERT INTO inbox
						(user_id, type, title, message)
						VALUES (?, ?, ?, ?)
					`)
					.bind(
						sender.id,
						"friend_accepted",
						"Freundschaft angenommen",
						`${receiver.username} hat deine Freundschaftsanfrage angenommen.`
					)
					.run();

				return json({
					success: true,
					message: "Freundschaft angenommen.",
				});
			}

			/*
			 * ==========================================
			 * REJECT FRIEND REQUEST
			 * ==========================================
			 */

			if (
				path === "/api/friends/reject" &&
				request.method === "POST"
			) {
				const body = (await request.json()) as FriendRequestBody;

				if (!body.minecraft_uuid || !body.friend_uuid) {
					return json({
						success: false,
						error: "minecraft_uuid und friend_uuid sind erforderlich.",
					}, 400);
				}

				const receiverUuid = normalizeUuid(body.minecraft_uuid);
				const senderUuid = normalizeUuid(body.friend_uuid);

				const receiver = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(receiverUuid)
					.first<{ id: number }>();

				const sender = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(senderUuid)
					.first<{ id: number }>();

				if (!receiver || !sender) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				const result = await env.DB
					.prepare(`
						UPDATE friend_requests
						SET status = 'rejected'
						WHERE sender_id = ?
							AND receiver_id = ?
							AND status = 'pending'
					`)
					.bind(sender.id, receiver.id)
					.run();

				if (result.meta.changes === 0) {
					return json({
						success: false,
						error: "Freundschaftsanfrage nicht gefunden.",
					}, 404);
				}

				return json({
					success: true,
					message: "Freundschaftsanfrage abgelehnt.",
				});
			}

			/*
			 * ==========================================
			 * GET FRIENDS
			 * ==========================================
			 *
			 * GET /api/friends?uuid=...
			 */

			if (
				path === "/api/friends" &&
				request.method === "GET"
			) {
				const uuidParam = url.searchParams.get("uuid");

				if (!uuidParam) {
					return json({
						success: false,
						error: "uuid fehlt.",
					}, 400);
				}

				const uuid = normalizeUuid(uuidParam);

				const user = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.first<{ id: number }>();

				if (!user) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				const result = await env.DB
					.prepare(`
						SELECT
							u.username,
							u.minecraft_uuid,
							u.online,
							u.last_online,
							f.friends_since
						FROM friendships f
						JOIN users u
							ON u.id = f.friend_id
						WHERE f.user_id = ?
						ORDER BY u.online DESC, u.username ASC
					`)
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
			 * POST /api/friends/remove
			 */

			if (
				path === "/api/friends/remove" &&
				request.method === "POST"
			) {
				const body = (await request.json()) as FriendRequestBody;

				if (!body.minecraft_uuid || !body.friend_uuid) {
					return json({
						success: false,
						error: "minecraft_uuid und friend_uuid sind erforderlich.",
					}, 400);
				}

				const uuid1 = normalizeUuid(body.minecraft_uuid);
				const uuid2 = normalizeUuid(body.friend_uuid);

				const user1 = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid1)
					.first<{ id: number }>();

				const user2 = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid2)
					.first<{ id: number }>();

				if (!user1 || !user2) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				await env.DB
					.prepare(`
						DELETE FROM friendships
						WHERE
							(user_id = ? AND friend_id = ?)
							OR
							(user_id = ? AND friend_id = ?)
					`)
					.bind(
						user1.id,
						user2.id,
						user2.id,
						user1.id
					)
					.run();

				return json({
					success: true,
					message: "Freund entfernt.",
				});
			}

			/*
			 * ==========================================
			 * INBOX
			 * ==========================================
			 *
			 * GET /api/inbox?uuid=...
			 */

			if (
				path === "/api/inbox" &&
				request.method === "GET"
			) {
				const uuidParam = url.searchParams.get("uuid");

				if (!uuidParam) {
					return json({
						success: false,
						error: "uuid fehlt.",
					}, 400);
				}

				const uuid = normalizeUuid(uuidParam);

				const user = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.first<{ id: number }>();

				if (!user) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				const result = await env.DB
					.prepare(`
						SELECT
							id,
							type,
							title,
							message,
							is_read,
							created_at
						FROM inbox
						WHERE user_id = ?
						ORDER BY created_at DESC
						LIMIT 50
					`)
					.bind(user.id)
					.all();

				return json({
					success: true,
					messages: result.results,
				});
			}

			/*
			 * ==========================================
			 * MARK INBOX MESSAGE AS READ
			 * ==========================================
			 */

			if (
				path === "/api/inbox/read" &&
				request.method === "POST"
			) {
				const body = await request.json() as {
					uuid?: string;
					message_id?: number;
				};

				if (!body.uuid || !body.message_id) {
					return json({
						success: false,
						error: "uuid und message_id sind erforderlich.",
					}, 400);
				}

				const uuid = normalizeUuid(body.uuid);

				const user = await env.DB
					.prepare(`
						SELECT id
						FROM users
						WHERE minecraft_uuid = ?
					`)
					.bind(uuid)
					.first<{ id: number }>();

				if (!user) {
					return json({
						success: false,
						error: "Benutzer nicht gefunden.",
					}, 404);
				}

				await env.DB
					.prepare(`
						UPDATE inbox
						SET is_read = 1
						WHERE id = ?
							AND user_id = ?
					`)
					.bind(body.message_id, user.id)
					.run();

				return json({
					success: true,
				});
			}

			/*
			 * ==========================================
			 * ONLINE PLAYER COUNT
			 * ==========================================
			 */

			if (
				path === "/api/stats/online" &&
				request.method === "GET"
			) {
				await env.DB
					.prepare(`
						UPDATE users
						SET online = 0
						WHERE online = 1
							AND last_online < unixepoch() - 120
					`)
					.run();

				const result = await env.DB
					.prepare(`
						SELECT COUNT(*) AS count
						FROM users
						WHERE online = 1
					`)
					.first<{ count: number }>();

				return json({
					success: true,
					online_players: result?.count ?? 0,
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
					.prepare(`
						SELECT
							id,
							minecraft_uuid,
							username,
							online,
							last_online,
							created_at
						FROM users
						ORDER BY id DESC
						LIMIT 100
					`)
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
					.prepare(`
						SELECT COUNT(*) AS count
						FROM users
						WHERE online = 1
					`)
					.first<{ count: number }>();

				return new Response(`
					<!DOCTYPE html>
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
								<strong>${result?.count ?? 0}</strong>
							</p>
						</div>
					</body>
					</html>
				`, {
					headers: {
						"content-type": "text/html; charset=UTF-8",
					},
				});
			}

			return json({
				success: false,
				error: "API-Endpunkt nicht gefunden.",
				path,
			}, 404);

		} catch (error) {
			console.error(error);

			return json({
				success: false,
				error: "Interner Serverfehler.",
				details:
					error instanceof Error
						? error.message
						: String(error),
			}, 500);
		}
	},
} satisfies ExportedHandler<Env>;
