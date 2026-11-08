## Procedure

1. 读取已安装 Pi 版本和扩展开发依赖版本，分别定位工具声明、validateToolArguments、constrained-sampling 和 agent-loop 实现。
2. 用 registerTool 桩捕获真实定义。对同一漏填参数依次调用真实 validateToolArguments 和 execute；使用不会进入文件写入的参数，并断言具体错误。
3. 对原 schema 调用 makeStrictJsonSchema、resolveJsonSchemaStrictSampling，并检查 provider 转换后的请求对象。验证可选字段是否变为 nullable，条件或对象 union 是否使 strict 降级。
4. 在真实工具执行入口验证失败状态。仅返回 success:false 不等于运行时失败；确认目标版本是否识别返回的 isError，或改用跨版本可识别的抛错。
5. 对缺失、null、空白、空数组、非法数组元素做反例。检查 prepareArguments 在 schema 转换前的行为；字段必填不能替代原始输入类型校验。
6. 比较保留单工具的兼容增强与独立必填入口。复用既有存储实现；旧接口若仍默认暴露，保留其失误通道。分别说明本地契约验证与真实模型验证的范围。

## Pitfalls

- 已核验的 Pi 0.84.4 和 0.99.2 strict 转换不支持 if/then、oneOf 或对象 union；prefer 会降级，require 会报错。升级后重新验证限制。
- 原始可选字段开启 strict 后仍可为 null，不能据此声称业务条件必填已被强制执行。
- 已核验版本的 TypeBox 转换可把必填字段中的 null 转成字符串 "null"，甚至数组 ["null"]；转换前拒绝非法类型。
- Pi 0.84.4 的工具执行器不读取返回的 isError；仅加该字段不能修复旧版本的错误状态。
- 条件 schema 若在本地通过，不代表模型服务支持；codemode 的程序调用也不受服务端参数采样约束。

## Verification

1. 漏填反例准确区分 schema 放行、执行拒绝和最终 isError；失败路径没有文件副作用。
2. 对支持 strict 的 provider，请求声明中的必填字段不允许 null；不支持时按明确的兼容策略降级或拒绝。
3. 直调与 codemode 均验证合法创建、一次补齐缺字段、非法输入拒绝；未执行的真实模型测试明确标为待验收。
