export default {
    async email(message, env, ctx) {
      // 1. 获取基本信息
      const sender = message.from;
      const recipient = message.to;
  
      // 2. 获取邮件原始内容 (Stream -> Text)
      // 注意：如果是超大邮件，这里可能需要流式处理，但对于普通文本/HTML邮件，直接读成文本即可
      let rawContent = "";
      try {
        // 将 ReadableStream 转换为文本
        rawContent = await new Response(message.raw).text();
      } catch (e) {
        console.error(`Failed to read email body: ${e.message}`);
        return;
      }
  
      // 3. 构建发送给后端的 Payload
      const payload = {
        sender: sender,
        recipient: recipient,
        raw_content: rawContent, // 原始 MIME 内容，后端会解析
        received_at: new Date().toISOString()
      };
  
      // 4. 发送到你的后端
      // 注意：你的后端是 HTTP，Cloudflare Worker 默认支持发往 HTTP 端口（但在某些严格模式下可能受限，通常没问题）
      const backendUrl = "http://9526.ip-ddns.com/mail_receiver.php";
      
      // 从环境变量获取密钥，或者直接硬编码（不推荐硬编码）
      // 在 Cloudflare 设置 -> Variables 中添加 SECRET_KEY
      const secret = env.SECRET_KEY || "你的.env里配置的EMAIL_WORKER_SECRET"; 
  
      try {
        const response = await fetch(backendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secret}`, // 发送密钥进行验证
            "User-Agent": "Cloudflare-Email-Worker/1.0"
          },
          body: JSON.stringify(payload)
        });
  
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Backend failed [${response.status}]: ${errorText}`);
          // 如果后端失败，我们可以选择拒收邮件或者只是记录日志
          // message.setReject("Backend processing failed"); 
        } else {
          console.log(`Successfully forwarded email from ${sender}`);
        }
      } catch (err) {
        console.error(`Network error posting to backend: ${err.message}`);
        // message.setReject("Internal Error");
      }
    }
  };