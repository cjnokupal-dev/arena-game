# language: Python, file: server.py, target: Termux / any OS
# *Arena server — static files + auth + owner API. Stdlib only.*

import http.server
import socketserver
import os
import json
import sqlite3
import hashlib
import secrets
import time
import threading
import urllib.parse

HOST = '0.0.0.0'
PORT = int(os.environ.get('PORT', 8080))
ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, 'arena.db')
OWNER_USER = 'Nash'
OWNER_PASS = 'Nash234'
PBKDF2_ITER = 100_000

DB_LOCK = threading.Lock()


def _conn():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    return c


def db_init():
    with DB_LOCK:
        c = _conn()
        c.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                pw_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                is_owner INTEGER DEFAULT 0,
                is_admin INTEGER DEFAULT 0,
                banned INTEGER DEFAULT 0,
                muted_until INTEGER DEFAULT 0,
                last_daily INTEGER DEFAULT 0,
                daily_streak INTEGER DEFAULT 0,
                created_at INTEGER,
                last_login INTEGER,
                coins INTEGER DEFAULT 0,
                profile TEXT DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                created_at INTEGER,
                last_seen INTEGER
            );
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                action TEXT,
                ts INTEGER
            );
            CREATE TABLE IF NOT EXISTS positions (
                username TEXT PRIMARY KEY,
                x REAL, y REAL, aim REAL,
                hp REAL, max_hp REAL,
                role TEXT, gun TEXT,
                last_seen INTEGER
            );
            CREATE TABLE IF NOT EXISTS spawn_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount INTEGER,
                value INTEGER,
                ts INTEGER,
                by_user TEXT
            );
            CREATE TABLE IF NOT EXISTS friends (
                user_a TEXT, user_b TEXT, status TEXT, ts INTEGER,
                PRIMARY KEY (user_a, user_b)
            );
            CREATE TABLE IF NOT EXISTS rooms (
                room_id TEXT PRIMARY KEY, host TEXT, mode TEXT, status TEXT, created_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS room_members (
                room_id TEXT, username TEXT, joined_at INTEGER, ready INTEGER DEFAULT 0,
                PRIMARY KEY (room_id, username)
            );
            CREATE TABLE IF NOT EXISTS invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user TEXT, to_user TEXT, room_id TEXT, ts INTEGER
            );
            CREATE TABLE IF NOT EXISTS feature_flags (
                key TEXT PRIMARY KEY, value INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT, kind TEXT, detail TEXT, ts INTEGER
            );
            CREATE TABLE IF NOT EXISTS autoban_rules (
                key TEXT PRIMARY KEY, value INTEGER
            );
            CREATE TABLE IF NOT EXISTS chat (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                msg TEXT,
                ts INTEGER
            );
            CREATE TABLE IF NOT EXISTS broadcast (
                id INTEGER PRIMARY KEY,
                msg TEXT,
                ts INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_logs_id ON logs(id DESC);
        """)
        try:
            c.execute('ALTER TABLE sessions ADD COLUMN last_seen INTEGER')
        except Exception:
            pass
        try:
            c.execute('ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0')
        except Exception:
            pass
        try:
            c.execute('ALTER TABLE users ADD COLUMN muted_until INTEGER DEFAULT 0')
        except Exception:
            pass
        try:
            c.execute('ALTER TABLE users ADD COLUMN last_daily INTEGER DEFAULT 0')
        except Exception:
            pass
        try:
            c.execute('ALTER TABLE users ADD COLUMN daily_streak INTEGER DEFAULT 0')
        except Exception:
            pass
        try:
            c.execute('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0')
        except Exception:
            pass
        row = c.execute('SELECT username FROM users WHERE username=?', (OWNER_USER,)).fetchone()
        if not row:
            salt = secrets.token_hex(16)
            h = hashlib.pbkdf2_hmac('sha256', OWNER_PASS.encode(), salt.encode(), PBKDF2_ITER).hex()
            default_profile = json.dumps({
                'coins': 999999, 'bestWave': 0, 'bestScore': 0,
                'meta': {'damage':0,'speed':0,'maxHp':0,'fireRate':0,'regen':0,'luck':0},
                'store': {}, 'currentRole': None, 'gunSkin': 'default', 'unlockedGuns': []
            })
            c.execute(
                'INSERT INTO users (username, pw_hash, salt, is_owner, created_at, last_login, coins, profile) VALUES (?,?,?,?,?,?,?,?)',
                (OWNER_USER, h, salt, 1, int(time.time()), int(time.time()), 999999, default_profile)
            )
        c.commit()
        c.close()


def _hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt.encode('utf-8'), PBKDF2_ITER).hex()


def _activity_log(username, kind, detail):
    try:
        with DB_LOCK:
            c = _conn()
            c.execute('INSERT INTO activity (username, kind, detail, ts) VALUES (?,?,?,?)',
                      (username, kind, (detail or '')[:200], int(time.time())))
            c.execute('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 2000)')
            c.commit()
            c.close()
    except Exception:
        pass


def _autoban_get(key, default=0):
    try:
        with DB_LOCK:
            c = _conn()
            c.execute('CREATE TABLE IF NOT EXISTS autoban_rules (key TEXT PRIMARY KEY, value INTEGER)')
            row = c.execute('SELECT value FROM autoban_rules WHERE key=?', (key,)).fetchone()
            c.close()
        return row['value'] if row else default
    except Exception:
        return default


def _autoban_set(key, value):
    try:
        with DB_LOCK:
            c = _conn()
            c.execute('CREATE TABLE IF NOT EXISTS autoban_rules (key TEXT PRIMARY KEY, value INTEGER)')
            c.execute('INSERT OR REPLACE INTO autoban_rules (key, value) VALUES (?,?)', (key, int(value)))
            c.commit()
            c.close()
    except Exception:
        pass


def _check_autoban(username, reason):
    """Return (should_ban, message) based on current rules."""
    if not username or username == OWNER_USER:
        return (False, '')
    try:
        u = _get_user(username)
        if not u:
            return (False, '')
        if u.get('is_owner') or u.get('is_admin'):
            return (False, '')  # never autoban staff
        now = int(time.time())
        recent = []
        with DB_LOCK:
            c = _conn()
            rows = c.execute('SELECT kind, detail, ts FROM activity WHERE username=? AND ts > ? ORDER BY ts DESC LIMIT 100',
                             (username, now - 60)).fetchall()
            c.close()
            recent = [dict(r) for r in rows]
        # rule: chat spam — more than N messages in 10 seconds
        spam_limit = _autoban_get('spam_per_10s', 8)
        if spam_limit > 0:
            chat_recent = [r for r in recent if r['kind'] == 'chat' and (now - r['ts']) < 10]
            if len(chat_recent) > spam_limit:
                return (True, 'chat spam (' + str(len(chat_recent)) + ' msgs / 10s)')
        # rule: identical message repeated
        rep_limit = _autoban_get('repeat_msg', 5)
        if rep_limit > 0:
            identical = [r for r in recent if r['kind'] == 'chat']
            msgs = [r['detail'] for r in identical[:20]]
            if len(msgs) >= rep_limit:
                top = msgs[0]
                same = sum(1 for m in msgs[:rep_limit] if m == top)
                if same >= rep_limit:
                    return (True, 'repeated message x' + str(same))
        # rule: teleport (position jump > threshold)
        tp_dist = _autoban_get('teleport_dist', 1200)
        if tp_dist > 0:
            pos_recent = [r for r in recent if r['kind'] == 'position' and (now - r['ts']) < 30]
            for i in range(len(pos_recent) - 1):
                try:
                    a = json.loads(pos_recent[i]['detail'])
                    b = json.loads(pos_recent[i+1]['detail'])
                    d = ((a['x']-b['x'])**2 + (a['y']-b['y'])**2) ** 0.5
                    # teleport uses 180-300px dashes, wallhack uses bigger jumps
                    if d > tp_dist:
                        return (True, 'position jump ' + str(int(d)) + 'px')
                except Exception:
                    pass
        return (False, '')
    except Exception:
        return (False, '')


def _apply_autoban(username, reason):
    try:
        with DB_LOCK:
            c = _conn()
            c.execute('UPDATE users SET banned=1 WHERE username=?', (username,))
            c.execute('DELETE FROM sessions WHERE username=?', (username,))
            c.commit()
            c.close()
        _log(username, 'AUTOBAN: ' + reason)
        _activity_log(username, 'autoban', reason)
    except Exception:
        pass


def _log(username, action):
    try:
        with DB_LOCK:
            c = _conn()
            c.execute('INSERT INTO logs (username, action, ts) VALUES (?,?,?)', (username, action, int(time.time())))
            c.commit()
            c.close()
    except Exception:
        pass


def _new_session(username):
    token = secrets.token_urlsafe(32)
    with DB_LOCK:
        c = _conn()
        now = int(time.time())
        c.execute('INSERT INTO sessions (token, username, created_at, last_seen) VALUES (?,?,?,?)',
                  (token, username, now, now))
        c.commit()
        c.close()
    return token


def _session_user(token):
    if not token:
        return None
    with DB_LOCK:
        c = _conn()
        row = c.execute('SELECT username FROM sessions WHERE token=?', (token,)).fetchone()
        if row:
            c.execute('UPDATE sessions SET last_seen=? WHERE token=?', (int(time.time()), token))
            c.commit()
        c.close()
    return row['username'] if row else None


def _delete_session(token):
    with DB_LOCK:
        c = _conn()
        c.execute('DELETE FROM sessions WHERE token=?', (token,))
        c.commit()
        c.close()


def _get_user(username):
    with DB_LOCK:
        c = _conn()
        row = c.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        c.close()
    return dict(row) if row else None


def _all_users():
    with DB_LOCK:
        c = _conn()
        rows = c.execute('SELECT username, is_owner, created_at, last_login, coins, COALESCE(banned,0) as banned, COALESCE(muted_until,0) as muted_until FROM users ORDER BY created_at DESC').fetchall()
        c.close()
    return [dict(r) for r in rows]


def _recent_logs(limit=200):
    with DB_LOCK:
        c = _conn()
        rows = c.execute('SELECT username, action, ts FROM logs ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
        c.close()
    return [dict(r) for r in rows]


def _update_profile(username, profile_dict):
    with DB_LOCK:
        c = _conn()
        coins = int(profile_dict.get('coins', 0))
        c.execute('UPDATE users SET profile=?, coins=? WHERE username=?',
                  (json.dumps(profile_dict), coins, username))
        c.commit()
        c.close()


def _grant_coins(username, amount):
    with DB_LOCK:
        c = _conn()
        row = c.execute('SELECT coins, profile FROM users WHERE username=?', (username,)).fetchone()
        if not row:
            c.close()
            return None
        new_coins = int(row['coins']) + int(amount)
        prof = json.loads(row['profile'] or '{}')
        prof['coins'] = new_coins
        c.execute('UPDATE users SET coins=?, profile=? WHERE username=?',
                  (new_coins, json.dumps(prof), username))
        c.commit()
        c.close()
    return new_coins


def _delete_user(username):
    if username == OWNER_USER:
        return False
    with DB_LOCK:
        c = _conn()
        c.execute('DELETE FROM users WHERE username=?', (username,))
        c.execute('DELETE FROM sessions WHERE username=?', (username,))
        c.commit()
        c.close()
    return True


def _online_users(window=300):
    cutoff = int(time.time()) - window
    with DB_LOCK:
        c = _conn()
        rows = c.execute('SELECT DISTINCT username FROM sessions WHERE last_seen > ?', (cutoff,)).fetchall()
        c.close()
    return [r['username'] for r in rows]


def _recent_chat(limit=30):
    with DB_LOCK:
        c = _conn()
        rows = c.execute('SELECT username, msg, ts FROM chat ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
        c.close()
    return [dict(r) for r in reversed(rows)]


def _add_chat(username, msg):
    with DB_LOCK:
        c = _conn()
        c.execute('INSERT INTO chat (username, msg, ts) VALUES (?,?,?)', (username, msg, int(time.time())))
        # keep only last 200
        c.execute('DELETE FROM chat WHERE id NOT IN (SELECT id FROM chat ORDER BY id DESC LIMIT 200)')
        c.commit()
        c.close()


def _grant_to_all(amount):
    with DB_LOCK:
        c = _conn()
        rows = c.execute('SELECT username, coins, profile FROM users').fetchall()
        total = 0
        for r in rows:
            new_c = int(r['coins']) + int(amount)
            prof = json.loads(r['profile'] or '{}')
            prof['coins'] = new_c
            c.execute('UPDATE users SET coins=?, profile=? WHERE username=?',
                      (new_c, json.dumps(prof), r['username']))
            total += 1
        c.commit()
        c.close()
    return total


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js':   'text/javascript',
        '.mjs':  'text/javascript',
        '.css':  'text/css',
        '.json': 'application/json',
        '.html': 'text/html',
        '.svg':  'image/svg+xml',
        '.png':  'image/png',
        '.wav':  'audio/wav',
        '.ogg':  'audio/ogg',
    }

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)

    def _json(self, obj, status=200):
        try:
            payload = json.dumps(obj).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _read_json(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
        except Exception:
            n = 0
        if n <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return {}

    def _auth(self):
        tok = self.headers.get('X-Auth')
        if not tok:
            q = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(q)
            tok = (params.get('token') or [None])[0]
        return _session_user(tok), tok

    def _is_admin_or_owner(self, user):
        if not user:
            return False
        u = _get_user(user)
        if not u:
            return False
        return bool(u.get('is_owner') or u.get('is_admin'))

    def _is_owner_user(self, user):
        if not user:
            return False
        u = _get_user(user)
        return bool(u and u.get('is_owner'))

    def _api(self, method, path, body):
        # ==================== HEALTH ====================
        if path == '/api/health' and method == 'GET':
            return self._json({
                'ok': True,
                'routes': [
                    'POST /api/register', 'POST /api/login', 'POST /api/logout',
                    'GET /api/me', 'POST /api/profile', 'GET /api/broadcast',
                    'GET /api/owner/users', 'GET /api/owner/logs',
                    'POST /api/owner/grant', 'POST /api/owner/delete',
                    'GET /api/owner/dashboard', 'POST /api/owner/rain',
                    'POST /api/owner/broadcast', 'POST /api/owner/force-logout',
                ],
                'owner': OWNER_USER,
                'time': int(time.time()),
            })

        # ==================== PUBLIC ====================
        if path == '/api/register' and method == 'POST':
            u = (body.get('username') or '').strip()
            pw = body.get('password') or ''
            if len(u) < 2 or len(u) > 24:
                return self._json({'error': 'Username must be 2-24 chars'}, 400)
            if not u.replace('_', '').isalnum():
                return self._json({'error': 'Letters, numbers, underscore only'}, 400)
            if len(pw) < 3:
                return self._json({'error': 'Password too short'}, 400)
            if _get_user(u):
                return self._json({'error': 'Username taken'}, 400)
            salt = secrets.token_hex(16)
            h = _hash_pw(pw, salt)
            default_profile = json.dumps({
                'coins': 0, 'bestWave': 0, 'bestScore': 0,
                'meta': {'damage':0,'speed':0,'maxHp':0,'fireRate':0,'regen':0,'luck':0},
                'store': {}, 'currentRole': None, 'gunSkin': 'default', 'unlockedGuns': []
            })
            with DB_LOCK:
                c = _conn()
                c.execute(
                    'INSERT INTO users (username, pw_hash, salt, is_owner, created_at, last_login, coins, profile) VALUES (?,?,?,?,?,?,?,?)',
                    (u, h, salt, 0, int(time.time()), int(time.time()), 0, default_profile)
                )
                c.commit()
                c.close()
            _log(u, 'account-created')
            token = _new_session(u)
            return self._json({'ok': True, 'token': token, 'username': u, 'isOwner': False})

        if path == '/api/login' and method == 'POST':
            u = (body.get('username') or '').strip()
            pw = body.get('password') or ''
            user = _get_user(u)
            if not user:
                return self._json({'error': 'User not found'}, 400)
            if user.get('banned', 0):
                return self._json({'error': 'Account banned. Contact owner.'}, 403)
            if _hash_pw(pw, user['salt']) != user['pw_hash']:
                return self._json({'error': 'Wrong password'}, 400)
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET last_login=? WHERE username=?', (int(time.time()), u))
                c.commit()
                c.close()
            _log(u, 'login')
            token = _new_session(u)
            return self._json({'ok': True, 'token': token, 'username': u, 'isOwner': bool(user['is_owner'])})

        if path == '/api/logout' and method == 'POST':
            user, tok = self._auth()
            if tok:
                _delete_session(tok)
            if user:
                _log(user, 'logout')
            return self._json({'ok': True})

        if path == '/api/me' and method == 'GET':
            user, tok = self._auth()
            if not user:
                return self._json({'error': 'not authed'}, 401)
            u = _get_user(user)
            prof = json.loads(u['profile'] or '{}')
            prof['coins'] = u['coins']
            prof['username'] = user
            return self._json({'ok': True, 'profile': prof, 'isOwner': bool(u['is_owner']), 'isAdmin': bool(u.get('is_admin', 0)), 'username': user})

        if path == '/api/profile' and method == 'POST':
            user, tok = self._auth()
            if not user:
                return self._json({'error': 'not authed'}, 401)
            prof = body.get('profile') or {}
            _update_profile(user, prof)
            return self._json({'ok': True})

        if path == '/api/broadcast' and method == 'GET':
            with DB_LOCK:
                c = _conn()
                row = c.execute('SELECT msg, ts FROM broadcast ORDER BY id DESC LIMIT 1').fetchone()
                c.close()
            if not row:
                return self._json({'ok': True, 'msg': None})
            return self._json({'ok': True, 'msg': row['msg'], 'ts': row['ts']})

        if path == '/api/chat' and method == 'GET':
            return self._json({'ok': True, 'messages': _recent_chat(30)})

        if path == '/api/spawn-events' and method == 'GET':
            q = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(q)
            since = int((params.get('since') or ['0'])[0])
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS spawn_events (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER, value INTEGER, ts INTEGER, by_user TEXT)')
                rows = c.execute('SELECT id, amount, value, ts FROM spawn_events WHERE id > ? ORDER BY id ASC LIMIT 50', (since,)).fetchall()
                c.close()
            return self._json({'ok': True, 'events': [dict(r) for r in rows]})

        if path == '/api/position' and method == 'POST':
            user, tok = self._auth()
            if not user:
                return self._json({'error': 'not authed'}, 401)
            try:
                x = float(body.get('x') or 0)
                y = float(body.get('y') or 0)
                aim = float(body.get('aim') or 0)
                hp = float(body.get('hp') or 100)
                max_hp = float(body.get('maxHp') or 100)
            except Exception:
                return self._json({'error': 'bad numbers'}, 400)
            role = (body.get('role') or '')[:32]
            gun = (body.get('gun') or '')[:32]
            now = int(time.time())
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS positions (username TEXT PRIMARY KEY, x REAL, y REAL, aim REAL, hp REAL, max_hp REAL, role TEXT, gun TEXT, last_seen INTEGER)')
                c.execute('INSERT OR REPLACE INTO positions (username, x, y, aim, hp, max_hp, role, gun, last_seen) VALUES (?,?,?,?,?,?,?,?,?)',
                          (user, x, y, aim, hp, max_hp, role, gun, now))
                c.execute('DELETE FROM positions WHERE last_seen < ?', (now - 8,))
                c.commit()
                c.close()
            # log position sample periodically for autoban analysis
            try:
                _activity_log(user, 'position', json.dumps({'x': round(x, 1), 'y': round(y, 1)}))
                ban_check = _check_autoban(user, 'position')
                if ban_check[0]:
                    _apply_autoban(user, ban_check[1])
                    return self._json({'error': 'Auto-banned: ' + ban_check[1]}, 403)
            except Exception:
                pass
            return self._json({'ok': True})

        if path == '/api/players' and method == 'GET':
            user, tok = self._auth()
            if not user:
                return self._json({'error': 'not authed'}, 401)
            now = int(time.time())
            cutoff = now - 8
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS positions (username TEXT PRIMARY KEY, x REAL, y REAL, aim REAL, hp REAL, max_hp REAL, role TEXT, gun TEXT, last_seen INTEGER)')
                if user == OWNER_USER:
                    rows = c.execute(
                        'SELECT username, x, y, aim, hp, max_hp, role, gun FROM positions WHERE last_seen > ? AND username != ?',
                        (cutoff, OWNER_USER)
                    ).fetchall()
                else:
                    rows = c.execute(
                        'SELECT username, x, y, aim, hp, max_hp, role, gun FROM positions WHERE last_seen > ? AND username != ? AND username != ?',
                        (cutoff, OWNER_USER, user)
                    ).fetchall()
                c.close()
            return self._json({'ok': True, 'players': [dict(r) for r in rows]})

        if path == '/api/user-chat' and method == 'POST':
            user, tok = self._auth()
            if not user:
                return self._json({'error': 'not authed'}, 401)
            msg = (body.get('message') or '').strip()[:200]
            if not msg:
                return self._json({'error': 'empty'}, 400)
            u = _get_user(user)
            if u and u.get('muted_until', 0) > int(time.time()):
                left = u['muted_until'] - int(time.time())
                return self._json({'error': 'Muted for ' + str(left) + 's'}, 403)
            _add_chat(user, msg)
            _activity_log(user, 'chat', msg)
            ban_check = _check_autoban(user, 'chat')
            if ban_check[0]:
                _apply_autoban(user, ban_check[1])
                return self._json({'error': 'Auto-banned: ' + ban_check[1]}, 403)
            return self._json({'ok': True})

        # ==================== FRIENDS ====================
        if path == '/api/friends' and method == 'GET':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            with DB_LOCK:
                c = _conn()
                rows = c.execute('''SELECT user_a, user_b, status FROM friends
                    WHERE (user_a=? OR user_b=?) AND status IN ('accepted','pending')''', (user, user)).fetchall()
                c.close()
            out = []
            now = int(time.time())
            for r in rows:
                other = r['user_b'] if r['user_a'] == user else r['user_a']
                is_sender = r['user_a'] == user
                with DB_LOCK:
                    c2 = _conn()
                    last = c2.execute('SELECT last_seen FROM sessions WHERE username=? ORDER BY last_seen DESC LIMIT 1', (other,)).fetchone()
                    room = c2.execute('SELECT room_id FROM room_members WHERE username=? LIMIT 1', (other,)).fetchone()
                    c2.close()
                online = bool(last and last['last_seen'] and (now - last['last_seen']) < 60)
                out.append({
                    'username': other, 'status': r['status'], 'isSender': is_sender,
                    'online': online, 'room': room['room_id'] if room else None
                })
            return self._json({'ok': True, 'friends': out})

        if path == '/api/friend/request' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            to = (body.get('username') or '').strip()
            if not to or to == user: return self._json({'error': 'bad username'}, 400)
            if not _get_user(to): return self._json({'error': 'user not found'}, 404)
            a, b = sorted([user, to])
            with DB_LOCK:
                c = _conn()
                ex = c.execute('SELECT status FROM friends WHERE user_a=? AND user_b=?', (a, b)).fetchone()
                if ex: c.close(); return self._json({'error': 'already ' + ex['status']}, 400)
                c.execute('INSERT INTO friends (user_a, user_b, status, ts) VALUES (?,?,?,?)',
                          (a, b, 'pending', int(time.time())))
                c.commit()
                c.close()
            _log(user, 'friend-request → ' + to)
            return self._json({'ok': True})

        if path == '/api/friend/accept' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            other = (body.get('username') or '').strip()
            a, b = sorted([user, other])
            with DB_LOCK:
                c = _conn()
                row = c.execute('SELECT status FROM friends WHERE user_a=? AND user_b=?', (a, b)).fetchone()
                if not row: c.close(); return self._json({'error': 'no request'}, 404)
                c.execute('UPDATE friends SET status=? WHERE user_a=? AND user_b=?', ('accepted', a, b))
                c.commit()
                c.close()
            _log(user, 'friend-accept ← ' + other)
            return self._json({'ok': True})

        if path == '/api/friend/remove' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            other = (body.get('username') or '').strip()
            a, b = sorted([user, other])
            with DB_LOCK:
                c = _conn()
                c.execute('DELETE FROM friends WHERE user_a=? AND user_b=?', (a, b))
                c.commit()
                c.close()
            return self._json({'ok': True})

        # ==================== ROOMS ====================
        if path == '/api/room/create' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            mode = (body.get('mode') or 'duo')[:16]
            room_id = secrets.token_hex(3).upper()
            with DB_LOCK:
                c = _conn()
                c.execute('INSERT INTO rooms (room_id, host, mode, status, created_at) VALUES (?,?,?,?,?)',
                          (room_id, user, mode, 'lobby', int(time.time())))
                c.execute('INSERT INTO room_members (room_id, username, joined_at, ready) VALUES (?,?,?,?)',
                          (room_id, user, int(time.time()), 1))
                c.commit()
                c.close()
            _log(user, 'room-created ' + room_id + ' (' + mode + ')')
            return self._json({'ok': True, 'room': room_id, 'mode': mode})

        if path == '/api/room/join' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            room_id = (body.get('room') or '').strip().upper()
            with DB_LOCK:
                c = _conn()
                room = c.execute('SELECT * FROM rooms WHERE room_id=?', (room_id,)).fetchone()
                if not room: c.close(); return self._json({'error': 'room not found'}, 404)
                if room['status'] != 'lobby': c.close(); return self._json({'error': 'game in progress'}, 400)
                limit = {'solo':1, 'duo':2, 'trio':3, 'squad':4}.get(room['mode'], 4)
                cnt = c.execute('SELECT COUNT(*) AS n FROM room_members WHERE room_id=?', (room_id,)).fetchone()['n']
                if cnt >= limit: c.close(); return self._json({'error': 'room full'}, 400)
                c.execute('DELETE FROM room_members WHERE username=?', (user,))
                c.execute('INSERT OR REPLACE INTO room_members (room_id, username, joined_at, ready) VALUES (?,?,?,?)',
                          (room_id, user, int(time.time()), 0))
                c.commit()
                c.close()
            return self._json({'ok': True, 'room': room_id})

        if path == '/api/room/leave' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            with DB_LOCK:
                c = _conn()
                row = c.execute('SELECT room_id FROM room_members WHERE username=?', (user,)).fetchone()
                if row:
                    c.execute('DELETE FROM room_members WHERE username=?', (user,))
                    rem = c.execute('SELECT COUNT(*) AS n FROM room_members WHERE room_id=?', (row['room_id'],)).fetchone()['n']
                    if rem == 0:
                        c.execute('DELETE FROM rooms WHERE room_id=?', (row['room_id'],))
                c.commit()
                c.close()
            return self._json({'ok': True})

        if path == '/api/room/state' and method == 'GET':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            with DB_LOCK:
                c = _conn()
                mem = c.execute('SELECT room_id FROM room_members WHERE username=?', (user,)).fetchone()
                if not mem: c.close(); return self._json({'ok': True, 'room': None})
                rid = mem['room_id']
                room = c.execute('SELECT * FROM rooms WHERE room_id=?', (rid,)).fetchone()
                if not room: c.close(); return self._json({'ok': True, 'room': None})
                members = c.execute('SELECT username, ready FROM room_members WHERE room_id=? ORDER BY joined_at', (rid,)).fetchall()
                c.close()
            now = int(time.time())
            online = []
            with DB_LOCK:
                c = _conn()
                for m in members:
                    last = c.execute('SELECT last_seen FROM sessions WHERE username=? ORDER BY last_seen DESC LIMIT 1', (m['username'],)).fetchone()
                    online.append({
                        'username': m['username'], 'ready': bool(m['ready']),
                        'isHost': m['username'] == room['host'],
                        'online': bool(last and last['last_seen'] and (now - last['last_seen']) < 60)
                    })
                c.close()
            return self._json({'ok': True, 'room': {'id': rid, 'host': room['host'], 'mode': room['mode'], 'status': room['status'], 'members': online}})

        if path == '/api/room/ready' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            r = 1 if body.get('ready') else 0
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE room_members SET ready=? WHERE username=?', (r, user))
                c.commit()
                c.close()
            return self._json({'ok': True})

        if path == '/api/room/start' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            with DB_LOCK:
                c = _conn()
                room = c.execute('SELECT * FROM rooms WHERE host=?', (user,)).fetchone()
                if not room: c.close(); return self._json({'error': 'not host'}, 403)
                c.execute('UPDATE rooms SET status=? WHERE room_id=?', ('playing', room['room_id']))
                c.commit()
                c.close()
            _log(user, 'room-start ' + room['room_id'])
            return self._json({'ok': True})

        if path == '/api/room/invite' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            to = (body.get('username') or '').strip()
            with DB_LOCK:
                c = _conn()
                mem = c.execute('SELECT room_id FROM room_members WHERE username=?', (user,)).fetchone()
                if not mem: c.close(); return self._json({'error': 'not in room'}, 400)
                c.execute('INSERT INTO invites (from_user, to_user, room_id, ts) VALUES (?,?,?,?)',
                          (user, to, mem['room_id'], int(time.time())))
                c.commit()
                c.close()
            return self._json({'ok': True})

        if path == '/api/invites' and method == 'GET':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            with DB_LOCK:
                c = _conn()
                rows = c.execute('SELECT id, from_user, room_id, ts FROM invites WHERE to_user=? AND ts > ? ORDER BY id DESC LIMIT 10',
                                 (user, int(time.time()) - 300)).fetchall()
                c.close()
            return self._json({'ok': True, 'invites': [dict(r) for r in rows]})

        if path == '/api/coop/players' and method == 'GET':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            with DB_LOCK:
                c = _conn()
                mem = c.execute('SELECT room_id FROM room_members WHERE username=?', (user,)).fetchone()
                if not mem: c.close(); return self._json({'ok': True, 'players': []})
                rid = mem['room_id']
                room = c.execute('SELECT status FROM rooms WHERE room_id=?', (rid,)).fetchone()
                if not room or room['status'] != 'playing': c.close(); return self._json({'ok': True, 'players': []})
                members = c.execute('SELECT username FROM room_members WHERE room_id=?', (rid,)).fetchall()
                now = int(time.time())
                out = []
                for m in members:
                    if m['username'] == user: continue
                    pos = c.execute('SELECT x, y, aim, hp, max_hp, role, gun, last_seen FROM positions WHERE username=?', (m['username'],)).fetchone()
                    if pos and (now - pos['last_seen']) < 10:
                        out.append({'username': m['username'], 'x': pos['x'], 'y': pos['y'],
                                    'aim': pos['aim'], 'hp': pos['hp'], 'maxHp': pos['max_hp'],
                                    'role': pos['role'], 'gun': pos['gun']})
                c.close()
            return self._json({'ok': True, 'players': out})

        # ==================== PUBLIC EXTRAS ====================
        if path == '/api/leaderboard' and method == 'GET':
            with DB_LOCK:
                c = _conn()
                top_wave = c.execute('SELECT username, best_wave FROM (SELECT username, json_extract(profile,\'$.bestWave\') AS best_wave FROM users) ORDER BY best_wave DESC LIMIT 10').fetchall() if False else []
                # simpler: pull from profile JSON via python
                rows = c.execute('SELECT username, profile FROM users').fetchall()
                c.close()
            board = []
            for r in rows:
                try:
                    pr = json.loads(r['profile'] or '{}')
                    bw = pr.get('bestWave', 0)
                    bs = pr.get('bestScore', 0)
                    board.append({'username': r['username'], 'bestWave': bw, 'bestScore': bs})
                except Exception:
                    pass
            board.sort(key=lambda x: (-x['bestWave'], -x['bestScore']))
            return self._json({'ok': True, 'leaderboard': board[:25]})

        if path == '/api/flags' and method == 'GET':
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, value INTEGER DEFAULT 1)')
                rows = c.execute('SELECT key, value FROM feature_flags').fetchall()
                c.close()
            flags = {}
            for r in rows:
                flags[r['key']] = bool(r['value'])
            # defaults
            for k in ['chat', 'multiplayer', 'friends', 'chat_all', 'wildcard', 'boss', 'gunsmith']:
                if k not in flags: flags[k] = True
            return self._json({'ok': True, 'flags': flags})

        # ==================== PUBLIC EXTRAS ====================
        if path == '/api/leaderboard' and method == 'GET':
            with DB_LOCK:
                c = _conn()
                rows = c.execute('SELECT username, profile FROM users').fetchall()
                c.close()
            board = []
            for r in rows:
                try:
                    pr = json.loads(r['profile'] or '{}')
                    board.append({'username': r['username'],
                                  'bestWave': pr.get('bestWave', 0),
                                  'bestScore': pr.get('bestScore', 0)})
                except Exception:
                    pass
            board.sort(key=lambda x: (-x['bestWave'], -x['bestScore']))
            return self._json({'ok': True, 'leaderboard': board[:25]})

        if path == '/api/flags' and method == 'GET':
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, value INTEGER DEFAULT 1)')
                rows = c.execute('SELECT key, value FROM feature_flags').fetchall()
                c.close()
            flags = {}
            for r in rows:
                flags[r['key']] = bool(r['value'])
            for k in ['chat', 'multiplayer', 'friends', 'boss', 'wildcard', 'gunsmith']:
                if k not in flags: flags[k] = True
            return self._json({'ok': True, 'flags': flags})

        # ==================== ADMIN TIER ====================
        if path == '/api/owner/promote' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            promote = 1 if body.get('promote', True) else 0
            if target == OWNER_USER: return self._json({'error': 'cannot change owner'}, 400)
            t = _get_user(target)
            if not t: return self._json({'error': 'user not found'}, 404)
            if t.get('is_owner'): return self._json({'error': 'target is owner'}, 400)
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET is_admin=? WHERE username=?', (promote, target))
                c.commit()
                c.close()
            _log(target, ('promoted to admin' if promote else 'demoted from admin'))
            return self._json({'ok': True, 'is_admin': bool(promote)})

        if path == '/api/admin/users' and method == 'GET':
            user, tok = self._auth()
            if not self._is_admin_or_owner(user): return self._json({'error': 'not admin'}, 403)
            with DB_LOCK:
                c = _conn()
                rows = c.execute('SELECT username, is_owner, is_admin, created_at, last_login, coins, COALESCE(banned,0) AS banned, COALESCE(muted_until,0) AS muted_until FROM users ORDER BY created_at DESC').fetchall()
                c.close()
            return self._json({'ok': True, 'users': [dict(r) for r in rows], 'viewer_is_owner': bool(_get_user(user).get('is_owner'))})

        if path == '/api/admin/ban' and method == 'POST':
            user, tok = self._auth()
            if not self._is_admin_or_owner(user): return self._json({'error': 'not admin'}, 403)
            target = (body.get('username') or '').strip()
            ban = 1 if body.get('ban', True) else 0
            if target == OWNER_USER: return self._json({'error': 'cannot ban owner'}, 400)
            t = _get_user(target)
            if not t: return self._json({'error': 'not found'}, 404)
            # admins cannot ban other admins or owner
            if not _get_user(user).get('is_owner'):
                if t.get('is_owner') or t.get('is_admin'):
                    return self._json({'error': 'cannot ban staff'}, 403)
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET banned=? WHERE username=?', (ban, target))
                if ban: c.execute('DELETE FROM sessions WHERE username=?', (target,))
                c.commit()
                c.close()
            _log(target, ('banned' if ban else 'unbanned') + ' by ' + user)
            return self._json({'ok': True})

        if path == '/api/admin/mute' and method == 'POST':
            user, tok = self._auth()
            if not self._is_admin_or_owner(user): return self._json({'error': 'not admin'}, 403)
            target = (body.get('username') or '').strip()
            mins = int(body.get('minutes') or 0)
            if mins > 1440: mins = 1440  # admins capped at 24h
            until = int(time.time()) + mins * 60 if mins > 0 else 0
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET muted_until=? WHERE username=?', (until, target))
                c.commit()
                c.close()
            _log(target, ('muted ' + str(mins) + 'm' if mins else 'unmuted') + ' by ' + user)
            return self._json({'ok': True})

        if path == '/api/admin/kick' and method == 'POST':
            user, tok = self._auth()
            if not self._is_admin_or_owner(user): return self._json({'error': 'not admin'}, 403)
            target = (body.get('username') or '').strip()
            if target == OWNER_USER: return self._json({'error': 'cannot kick owner'}, 400)
            with DB_LOCK:
                c = _conn()
                n = c.execute('DELETE FROM sessions WHERE username=?', (target,)).rowcount
                c.commit()
                c.close()
            _log(target, 'kicked by ' + user)
            return self._json({'ok': True, 'sessions_killed': n})

        # ==================== DAILY REWARDS ====================
        if path == '/api/daily/status' and method == 'GET':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            u = _get_user(user)
            now = int(time.time())
            day = 24 * 3600
            last = u.get('last_daily', 0) or 0
            streak = u.get('daily_streak', 0) or 0
            ready = (now - last) >= day
            # streak broken if > 48h
            if last > 0 and (now - last) > 2 * day:
                streak = 0
            rewards = [100, 200, 350, 500, 800, 1200, 2500]
            next_day = (streak % 7) + 1 if ready else streak
            return self._json({
                'ok': True,
                'ready': ready,
                'streak': streak,
                'nextDay': next_day,
                'nextReward': rewards[(next_day - 1) % 7],
                'cooldown': max(0, day - (now - last)) if not ready else 0,
                'rewards': rewards
            })

        if path == '/api/daily/claim' and method == 'POST':
            user, tok = self._auth()
            if not user: return self._json({'error': 'not authed'}, 401)
            u = _get_user(user)
            now = int(time.time())
            day = 24 * 3600
            last = u.get('last_daily', 0) or 0
            streak = u.get('daily_streak', 0) or 0
            if (now - last) < day:
                return self._json({'error': 'not ready'}, 400)
            if last > 0 and (now - last) > 2 * day:
                streak = 0
            streak += 1
            rewards = [100, 200, 350, 500, 800, 1200, 2500]
            amount = rewards[(streak - 1) % 7]
            bonus_item = None
            if streak % 7 == 0:
                bonus_item = 'revive_token'
            with DB_LOCK:
                c = _conn()
                row = c.execute('SELECT profile, coins FROM users WHERE username=?', (user,)).fetchone()
                prof = json.loads(row['profile'] or '{}')
                new_coins = int(row['coins']) + amount
                prof['coins'] = new_coins
                if bonus_item:
                    if 'store' not in prof: prof['store'] = {}
                    prof['store'][bonus_item] = (prof['store'].get(bonus_item, 0) or 0) + 1
                c.execute('UPDATE users SET coins=?, profile=?, last_daily=?, daily_streak=? WHERE username=?',
                          (new_coins, json.dumps(prof), now, streak, user))
                c.commit()
                c.close()
            _log(user, 'daily-claim day ' + str(streak) + ' +' + str(amount))
            return self._json({'ok': True, 'amount': amount, 'streak': streak, 'bonus': bonus_item})

        # ==================== OWNER: ACTIVITY / AUTOBAN ====================
        if path == '/api/owner/activity' and method == 'GET':
            user, tok = self._auth()
            if not self._is_admin_or_owner(user):
                return self._json({'error': 'not staff'}, 403)
            q = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(q)
            filter_user = (params.get('user') or [''])[0]
            filter_kind = (params.get('kind') or [''])[0]
            limit = int((params.get('limit') or ['100'])[0])
            where = []
            args = []
            if filter_user:
                where.append('username=?')
                args.append(filter_user)
            if filter_kind:
                where.append('kind=?')
                args.append(filter_kind)
            sql = 'SELECT id, username, kind, detail, ts FROM activity'
            if where:
                sql += ' WHERE ' + ' AND '.join(where)
            sql += ' ORDER BY id DESC LIMIT ?'
            args.append(limit)
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, kind TEXT, detail TEXT, ts INTEGER)')
                rows = c.execute(sql, args).fetchall()
                c.close()
            return self._json({'ok': True, 'activity': [dict(r) for r in rows]})

        if path == '/api/owner/autoban-rules' and method == 'GET':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            rules = {
                'spam_per_10s': _autoban_get('spam_per_10s', 8),
                'repeat_msg': _autoban_get('repeat_msg', 5),
                'teleport_dist': _autoban_get('teleport_dist', 1200),
            }
            return self._json({'ok': True, 'rules': rules})

        if path == '/api/owner/autoban-rules' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            rules = body.get('rules') or {}
            for k, v in rules.items():
                _autoban_set(k, int(v))
            _log(user, 'autoban rules updated: ' + json.dumps(rules))
            return self._json({'ok': True})

        if path == '/api/owner/scan-all' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            now = int(time.time())
            with DB_LOCK:
                c = _conn()
                names = [r['username'] for r in c.execute('SELECT username FROM users WHERE COALESCE(banned,0)=0 AND is_owner=0').fetchall()]
                c.close()
            flagged = []
            for n in names:
                hit = _check_autoban(n, 'scan')
                if hit[0]:
                    flagged.append({'username': n, 'reason': hit[1]})
            return self._json({'ok': True, 'flagged': flagged, 'scanned': len(names)})

        # ==================== OWNER ====================
        if path == '/api/owner/analytics' and method == 'GET':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            now = int(time.time()); day = 24 * 3600
            with DB_LOCK:
                c = _conn()
                total_users = c.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n']
                banned_users = c.execute('SELECT COUNT(*) AS n FROM users WHERE COALESCE(banned,0)=1').fetchone()['n']
                new_today = c.execute('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', (now - day,)).fetchone()['n']
                new_week = c.execute('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', (now - 7*day,)).fetchone()['n']
                logins_today = c.execute("SELECT COUNT(*) AS n FROM logs WHERE action='login' AND ts > ?", (now - day,)).fetchone()['n']
                active = c.execute('SELECT COUNT(DISTINCT username) AS n FROM sessions WHERE last_seen > ?', (now - 300,)).fetchone()['n']
                total_coins = c.execute('SELECT COALESCE(SUM(coins),0) AS s FROM users').fetchone()['s']
                daily = []
                for i in range(7):
                    lo = now - (i+1)*day; hi = now - i*day
                    n = c.execute('SELECT COUNT(*) AS n FROM users WHERE created_at > ? AND created_at <= ?', (lo, hi)).fetchone()['n']
                    daily.append({'day': i, 'count': n})
                daily.reverse()
                c.close()
            return self._json({'ok': True, 'total_users': total_users, 'banned_users': banned_users,
                              'new_today': new_today, 'new_week': new_week, 'logins_today': logins_today,
                              'online': active, 'total_coins': total_coins, 'daily_registrations': daily})

        if path == '/api/owner/ban' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            ban = 1 if body.get('ban', True) else 0
            if target == OWNER_USER: return self._json({'error': 'cannot ban owner'}, 400)
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET banned=? WHERE username=?', (ban, target))
                if ban: c.execute('DELETE FROM sessions WHERE username=?', (target,))
                c.commit(); c.close()
            _log(target, 'banned' if ban else 'unbanned')
            return self._json({'ok': True})

        if path == '/api/owner/mute' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            mins = int(body.get('minutes') or 0)
            until = int(time.time()) + mins * 60 if mins > 0 else 0
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET muted_until=? WHERE username=?', (until, target))
                c.commit(); c.close()
            _log(target, 'muted ' + str(mins) + 'm' if mins else 'unmuted')
            return self._json({'ok': True, 'until': until})

        if path == '/api/owner/flags' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            flags = body.get('flags') or {}
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, value INTEGER DEFAULT 1)')
                for k, v in flags.items():
                    c.execute('INSERT OR REPLACE INTO feature_flags (key, value) VALUES (?,?)', (k, 1 if v else 0))
                c.commit(); c.close()
            _log('*', 'flags updated')
            return self._json({'ok': True})


        if path == '/api/owner/ban' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            ban = 1 if body.get('ban', True) else 0
            if target == OWNER_USER: return self._json({'error': 'cannot ban owner'}, 400)
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET banned=? WHERE username=?', (ban, target))
                if ban: c.execute('DELETE FROM sessions WHERE username=?', (target,))
                c.commit()
                c.close()
            _log(target, 'banned' if ban else 'unbanned by ' + user)
            return self._json({'ok': True})

        if path == '/api/owner/mute' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            mins = int(body.get('minutes') or 0)
            until = int(time.time()) + mins * 60 if mins > 0 else 0
            with DB_LOCK:
                c = _conn()
                c.execute('UPDATE users SET muted_until=? WHERE username=?', (until, target))
                c.commit()
                c.close()
            _log(target, ('muted ' + str(mins) + 'm' if mins else 'unmuted') + ' by ' + user)
            return self._json({'ok': True, 'until': until})

        if path == '/api/owner/flags' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            flags = body.get('flags') or {}
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, value INTEGER DEFAULT 1)')
                for k, v in flags.items():
                    c.execute('INSERT OR REPLACE INTO feature_flags (key, value) VALUES (?,?)', (k, 1 if v else 0))
                c.commit()
                c.close()
            _log('*', 'flags updated by ' + user)
            return self._json({'ok': True})

        if path == '/api/owner/analytics' and method == 'GET':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            now = int(time.time())
            day = 24 * 3600
            with DB_LOCK:
                c = _conn()
                total_users = c.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n']
                banned_users = c.execute('SELECT COUNT(*) AS n FROM users WHERE banned=1').fetchone()['n']
                new_today = c.execute('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', (now - day,)).fetchone()['n']
                new_week = c.execute('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', (now - 7*day,)).fetchone()['n']
                logins_today = c.execute("SELECT COUNT(*) AS n FROM logs WHERE action='login' AND ts > ?", (now - day,)).fetchone()['n']
                active_sessions = c.execute('SELECT COUNT(DISTINCT username) AS n FROM sessions WHERE last_seen > ?', (now - 300,)).fetchone()['n']
                total_coins = c.execute('SELECT COALESCE(SUM(coins),0) AS s FROM users').fetchone()['s']
                # daily registrations last 7d
                daily = []
                for i in range(7):
                    lo = now - (i+1)*day
                    hi = now - i*day
                    n = c.execute('SELECT COUNT(*) AS n FROM users WHERE created_at > ? AND created_at <= ?', (lo, hi)).fetchone()['n']
                    daily.append({'day': i, 'count': n})
                daily.reverse()
                c.close()
            return self._json({
                'ok': True,
                'total_users': total_users,
                'banned_users': banned_users,
                'new_today': new_today,
                'new_week': new_week,
                'logins_today': logins_today,
                'online': active_sessions,
                'total_coins': total_coins,
                'daily_registrations': daily
            })

        if path == '/api/owner/user-detail' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user): return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            u = _get_user(target)
            if not u: return self._json({'error': 'not found'}, 404)
            prof = {}
            try: prof = json.loads(u['profile'] or '{}')
            except Exception: pass
            return self._json({
                'ok': True,
                'username': u['username'],
                'is_owner': bool(u['is_owner']),
                'banned': bool(u.get('banned', 0)),
                'muted_until': u.get('muted_until', 0),
                'coins': u['coins'],
                'created_at': u.get('created_at', 0),
                'last_login': u.get('last_login', 0),
                'bestWave': prof.get('bestWave', 0),
                'bestScore': prof.get('bestScore', 0),
                'role': prof.get('currentRole'),
                'gunsmithLevels': sum((v.get('dmg',0)+v.get('rate',0)+v.get('mag',0)+v.get('rl',0)) for v in (prof.get('gunsmith') or {}).values())
            })





        if path == '/api/owner/spawn' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            amount = int(body.get('amount') or 0)
            value = int(body.get('value') or 4)
            if amount <= 0 or amount > 500:
                return self._json({'error': 'bad amount (1-500)'}, 400)
            with DB_LOCK:
                c = _conn()
                c.execute('CREATE TABLE IF NOT EXISTS spawn_events (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER, value INTEGER, ts INTEGER, by_user TEXT)')
                c.execute('INSERT INTO spawn_events (amount, value, ts, by_user) VALUES (?,?,?,?)',
                          (amount, value, int(time.time()), user))
                c.execute('DELETE FROM spawn_events WHERE id NOT IN (SELECT id FROM spawn_events ORDER BY id DESC LIMIT 50)')
                c.commit()
                c.close()
            _log('*', 'SPAWN ' + str(amount) + ' coins by ' + user)
            return self._json({'ok': True, 'amount': amount})

        if path == '/api/owner/chat' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            msg = (body.get('message') or '').strip()[:300]
            if not msg:
                return self._json({'error': 'empty'}, 400)
            _add_chat(user, msg)
            _log(user, 'CHAT: ' + msg)
            return self._json({'ok': True})

        if path == '/api/owner/users' and method == 'GET':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            return self._json({'ok': True, 'users': _all_users()})

        if path == '/api/owner/logs' and method == 'GET':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            return self._json({'ok': True, 'logs': _recent_logs(200)})

        if path == '/api/owner/grant' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            amt = int(body.get('amount') or 0)
            if not target or amt <= 0:
                return self._json({'error': 'bad args'}, 400)
            new_coins = _grant_coins(target, amt)
            if new_coins is None:
                return self._json({'error': 'user not found'}, 404)
            _log(target, '+' + str(amt) + ' coins by ' + user)
            return self._json({'ok': True, 'newCoins': new_coins})

        if path == '/api/owner/delete' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            if target == OWNER_USER:
                return self._json({'error': 'cannot delete owner'}, 400)
            if not _delete_user(target):
                return self._json({'error': 'user not found'}, 404)
            _log(target, 'account-deleted by ' + user)
            return self._json({'ok': True})

        if path == '/api/owner/dashboard' and method == 'GET':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            with DB_LOCK:
                c = _conn()
                total_users = c.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n']
                total_coins = c.execute('SELECT COALESCE(SUM(coins),0) AS s FROM users').fetchone()['s']
                top_users = c.execute(
                    'SELECT username, coins, last_login FROM users ORDER BY coins DESC LIMIT 10'
                ).fetchall()
                recent_reg = c.execute(
                    'SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 5'
                ).fetchall()
                c.close()
            return self._json({
                'ok': True,
                'total_users': total_users,
                'total_coins': total_coins,
                'online': _online_users(300),
                'top_users': [dict(r) for r in top_users],
                'recent_registrations': [dict(r) for r in recent_reg],
                'server_time': int(time.time()),
            })

        if path == '/api/owner/rain' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            amount = int(body.get('amount') or 0)
            if amount <= 0 or amount > 10_000_000:
                return self._json({'error': 'bad amount'}, 400)
            n = _grant_to_all(amount)
            _log('*', 'RAIN +' + str(amount) + ' to ' + str(n) + ' users by ' + user)
            return self._json({'ok': True, 'granted_to': n, 'amount': amount})

        if path == '/api/owner/broadcast' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            msg = (body.get('message') or '').strip()[:200]
            if not msg:
                return self._json({'error': 'empty'}, 400)
            with DB_LOCK:
                c = _conn()
                c.execute('DELETE FROM broadcast')
                c.execute('INSERT INTO broadcast (id, msg, ts) VALUES (1, ?, ?)', (msg, int(time.time())))
                c.commit()
                c.close()
            _log('*', 'BROADCAST: ' + msg)
            return self._json({'ok': True})

        if path == '/api/owner/force-logout' and method == 'POST':
            user, tok = self._auth()
            if not self._is_owner_user(user):
                return self._json({'error': 'not owner'}, 403)
            target = (body.get('username') or '').strip()
            if target == OWNER_USER:
                return self._json({'error': 'cannot logout owner'}, 400)
            with DB_LOCK:
                c = _conn()
                n = c.execute('DELETE FROM sessions WHERE username=?', (target,)).rowcount
                c.commit()
                c.close()
            _log(target, 'force-logout by ' + user)
            return self._json({'ok': True, 'sessions_killed': n})

        return None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/'):
            res = self._api('GET', path, None)
            if res is not None:
                return
            return self._json({'error': 'not found', 'path': path, 'method': 'GET'}, 404)
        if path == '/' or path == '':
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/'):
            body = self._read_json()
            res = self._api('POST', path, body)
            if res is not None:
                return
            return self._json({'error': 'not found', 'path': path, 'method': 'POST'}, 404)
        return self._json({'error': 'not found'}, 404)


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    db_init()
    os.chdir(ROOT)
    with Server((HOST, PORT), Handler) as httpd:
        print('[+] serving ' + ROOT)
        print('[+] db at ' + DB_PATH)
        print('[+] http://localhost:' + str(PORT))
        print('[+] test: curl http://localhost:' + str(PORT) + '/api/health')
        print('[.] Ctrl+C to stop')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n[.] bye')


if __name__ == '__main__':
    main()
