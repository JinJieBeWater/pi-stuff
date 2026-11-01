# 真实入口烟测

仅验证 skill 是否被原生加载、编排与工具是否真实执行；不把单个合成样例当作准确率或成本 benchmark。

1. 先跑 `test-review-validation.py`。沿用有效结果，只补真实入口缺口。
2. 模型调用前取得本轮授权：provider/model、thinking、会话数、时长上限及未知费用；明确是否允许重试。一次正常流程为一个编排会话加四个 reviewer，会话数不是 API 请求数。没有批准时停在离线检查。
3. 用临时 Git 仓库和独立 session 目录，选一个已知变更及验收标准。由外部保留预期结果；使用常规权限时明确未形成安全隔离。保留原始输入、SHA、Pi/扩展版本及 skill/profile 哈希。
4. 按当前 Pi 的 `docs/cli.md`、`docs/json.md` 核对命令与事件。沿用生产扩展和工具组合，通过原生命令加载 skill，不复制正文注入 prompt：

   ```sh
   pi --mode json --session-dir <temp-sessions> --provider <approved-provider> --model <approved-model> --thinking <approved-thinking> '/skill:multi-agent-review 相对 <base-ref> 审查'
   ```

5. 外部监督进程及预算，持续读取 stdout JSONL，stderr 单独保存；超限或未授权重试时停止，并关闭本轮尚存 workers。只跑已批准轮数。
6. 从主会话事件和 worker 的原生会话文件核对身份、时序、model、thinking 与 usage；按实际 cwd/session ID 定位，不猜文件名。本机的 `exec_command` 未提供 `PI_SESSION_FILE`，不将 worker 自报这个变量作为审查通过条件。
7. 核对原生事件确实展开了本 skill；三路初审并行；gate 是初审结束后启动的不同会话；真实执行了 capture/check；报告与校验结果一致；被评仓库、配置及 profiles 未变；所有本轮 workers 已关闭。不能只看进程 exit 0 或模型自述。
8. usage 只累计权威 assistant 完成记录，主会话与 workers 分开后汇总，reasoning 不重复计入 output。缺少 `responseModel` 时仅核验请求模型，实际计费未知时不报告为零。

保留真实命令、原始事件、会话路径、校验输出、外部核验及未通过项。修复文档或 harness 后不自动增加第二轮模型试跑；先复用可离线重核的证据。
