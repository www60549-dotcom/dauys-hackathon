-- name: GetUser :one
SELECT id, name, email, password_hash, role, department FROM users WHERE id=$1;
-- name: FindUser :one
SELECT id, name, email, password_hash, role, department FROM users WHERE email=$1;
-- name: CreateSession :exec
INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3);
-- name: GetSessionUser :one
SELECT u.id,u.name,u.email,u.password_hash,u.role,u.department FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now();
-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash=$1;
