# 管理员白名单 · 云端自助操作模板

> 数据源：云端数据库 `admins` 表（app 侧不做任何管理入口，保证严格）。
> 前提：要添加的用户**至少登录过一次**（这样 `users` 表里才有他的记录）。
> 注：`admins` 表只有 uid 一列，SQL 里不要写 email。

## 在哪执行

CloudBase 控制台 → 你的环境（gerenceshi-d0gguq5u39b4b86b2）→ **数据库** → **SQL 执行 / 查询**窗口。

## ① 查看当前管理员

```sql
SELECT a.uid, COALESCE(u.nickname, '') AS nickname, COALESCE(u.email, '') AS email
FROM admins a LEFT JOIN users u ON u.uid = a.uid ORDER BY a.uid;
```

## ② 添加管理员（按完整 UID 直插，最简单可靠）

```sql
INSERT INTO admins (uid) VALUES ('要加的完整UID')
ON CONFLICT (uid) DO NOTHING;
```

**不记得完整 UID？先从 users 表查（再挑下面任一方式定位）：**

```sql
-- 按邮箱找
SELECT uid, email, nickname FROM users WHERE LOWER(email) = LOWER('对方邮箱@qq.com');
-- 按 UID 尾号找
SELECT uid, email, nickname FROM users WHERE uid LIKE '%尾号6位';
```

查到完整 UID 后，用上面的 INSERT 语句添加。

## ③ 移除管理员

```sql
DELETE FROM admins WHERE uid = '要移除的完整UID';
```

## 注意事项

1. **生效延迟约 30 秒**：云端函数对管理员名单有 30 秒缓存，改完稍等再测试；
2. **给自己留后路**：永远至少保留一个管理员，移除自己前先添加别人；
3. 执行后如果提示 0 行受影响，多半是 WHERE 条件没匹配到（UID 抄错/该用户没登录过），先跑上面的查询确认。

## 当前 users 表参考（2026-02-16）

| UID | 昵称 | 说明 |
|---|---|---|
| 2097651199451856896 | 时光 | 你的主号（2837863259@qq.com），管理员 |
| 2099729825726996480 | 2835112874 | 你的另一个邮箱号 |
| 2100138268933758976 | 18262152570 | 手机号注册的号 |
| 2097125839932256258 | ProbeBase | 旧测试号（勿加） |
