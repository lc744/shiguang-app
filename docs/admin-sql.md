# 管理员白名单 · 云端自助操作模板

> 数据源：云端数据库 `admins` 表（app 侧不做任何管理入口，保证严格）。
> 前提：要添加的用户**至少登录过一次**（这样 `users` 表里才有他的记录）。

## 在哪执行

CloudBase 控制台 → 你的环境（gerenceshi-d0gguq5u39b4b86b2）→ **数据库** → **SQL 执行 / 查询**窗口。

## ① 查看当前管理员

```sql
SELECT a.uid, COALESCE(a.email, '') AS email, COALESCE(u.nickname, '') AS nickname
FROM admins a LEFT JOIN users u ON u.uid = a.uid ORDER BY a.uid;
```

## ② 添加管理员（三选一）

**按邮箱（推荐，最好记）：**

```sql
INSERT INTO admins (uid, email)
SELECT uid, email FROM users WHERE LOWER(email) = LOWER('对方邮箱@qq.com')
ON CONFLICT (uid) DO NOTHING;
```

**按 UID 尾号（尾号太短可能匹配多人，先跑查询确认）：**

```sql
-- 先查是谁
SELECT uid, email FROM users WHERE uid LIKE '%尾号6位';
-- 确认唯一后再加
INSERT INTO admins (uid, email)
SELECT uid, email FROM users WHERE uid LIKE '%尾号6位'
ON CONFLICT (uid) DO NOTHING;
```

**按完整 UID：**

```sql
INSERT INTO admins (uid, email)
SELECT uid, email FROM users WHERE uid = '完整UID'
ON CONFLICT (uid) DO NOTHING;
```

## ③ 移除管理员

```sql
DELETE FROM admins WHERE uid = '要移除的完整UID';
```

## 注意事项

1. **生效延迟约 30 秒**：云端函数对管理员名单有 30 秒缓存，改完稍等再测试；
2. **删除用户前先想清楚**：被移除的管理员下次打开管理面板会被拒绝；
3. **给自己留后路**：永远至少保留一个管理员，移除自己前先添加别人；
4. 微信登录的用户在 users 表里的邮箱是 `openid前12位@wx`，按邮箱加时注意区分。
