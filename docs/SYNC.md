# 跨设备同步指南

本项目保存在 GitHub 私有仓库 `zehouzhang0-lang/hackathon-workspace`，主分支为 `master`。

## 在另一台设备首次使用

安装 Git 和 GitHub CLI，用有仓库访问权限的 GitHub 账号登录，然后克隆：

```sh
gh auth login
gh auth setup-git
gh repo clone zehouzhang0-lang/hackathon-workspace
cd hackathon-workspace
```

如果新设备尚未配置提交身份，在克隆后的仓库内执行以下命令。这些设置仅对本仓库生效，no-reply 邮箱可避免公开个人邮箱：

```sh
git config user.name "zehouzhang0-lang"
git config user.email "277669114+zehouzhang0-lang@users.noreply.github.com"
```

队友设备也可以用自己的 GitHub 账号登录（例如已获写权限的 `zhiyukouchi-del`），克隆后把提交身份换成自己的用户名和对应 no-reply 邮箱。一台机器登多个账号时，用 `gh auth switch -h github.com -u 用户名` 切换当前生效账号。注意：协作者邀请必须先在网页上接受，否则 `push` 会返回 403 拒绝。

## 每次开工前

确认上次工作已提交，并拉取其他设备推送的更新：

```sh
git status
git pull --ff-only
```

## 完成一段工作后

先检查改动。`git diff` 不显示未跟踪文件的内容，应根据 `git status` 手动查看新增文件，确认没有敏感信息：

```sh
git status
git diff
git add .
git diff --cached
git commit -m "docs: update project progress"
git push
```

逐步执行；检查发现问题时先修正，再提交。提交消息可按实际改动修改。

## 注意事项

- 最好在一台设备完成、提交并成功推送后，再切换到另一台设备拉取更新。
- 如果 `pull` 提示分叉，或 `push` 被拒绝，先保留本地改动并确认原因；不要强制推送，也不要用 `reset --hard` 或 `clean` 清理更改。
- 不要提交 `.env`、API Key、访问令牌、密码或其他密钥；分享配置格式时使用不含真实密钥的示例文件。
- GitHub 只同步已提交并成功推送的文件，不会自动同步整个聊天会话、本地未提交内容或被 Git 忽略的文件。需要跨设备保留的项目进度，应写入项目文档并推送。
