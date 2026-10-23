
module.exports = async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "طريقة الطلب غير مسموح بها. استخدم POST."
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({
      error: "مفتاح OpenAI غير مضبوط. أضف OPENAI_API_KEY في إعدادات Vercel."
    });
  }

  try {
    const body = req.body || {};
    const system = body.system;
    const messages = body.messages;

    if (
      typeof system !== "string" ||
      !system.trim() ||
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 12
    ) {
      return res.status(400).json({
        error: "بيانات السؤال غير صالحة. حاول إرسال السؤال مرة أخرى."
      });
    }

    const input = [];

    for (const message of messages) {
      if (
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        !message.content.trim()
      ) {
        return res.status(400).json({
          error: "يوجد خطأ في بيانات المحادثة."
        });
      }

      input.push({
        role: message.role,
        content: message.content.slice(0, 6000)
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);

    let aiResponse;

    try {
      aiResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            instructions: system.slice(0, 5000),
            input: input,
            max_output_tokens: 1200
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    let result;

    try {
      result = await aiResponse.json();
    } catch {
      console.error("OpenAI returned an invalid response.");

      return res.status(502).json({
        error: "وصل رد غير مفهوم من خدمة الذكاء الاصطناعي."
      });
    }

    if (!aiResponse.ok) {
      console.error(
        "OpenAI API error:",
        aiResponse.status,
        result.error?.message || "Unknown error"
      );

      if (aiResponse.status === 401) {
        return res.status(502).json({
          error: "مفتاح OpenAI غير صالح. راجع إعدادات OPENAI_API_KEY."
        });
      }

      if (aiResponse.status === 429) {
        return res.status(502).json({
          error: "تم تجاوز حد الاستخدام أو الرصيد المتاح في حساب API. راجع الفوترة وحدود الاستخدام."
        });
      }

      if (aiResponse.status === 403) {
        return res.status(502).json({
          error: "حساب API لا يملك صلاحية تنفيذ الطلب. راجع صلاحيات الحساب."
        });
      }

      return res.status(502).json({
        error: "خدمة الذكاء الاصطناعي لم تقبل الطلب. حاول مرة أخرى لاحقًا."
      });
    }

    const reply = (result.output || [])
      .filter(function (item) {
        return item.type === "message";
      })
      .flatMap(function (item) {
        return item.content || [];
      })
      .filter(function (item) {
        return item.type === "output_text";
      })
      .map(function (item) {
        return item.text || "";
      })
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "النموذج لم يُرجع نصًا. حاول صياغة السؤال بطريقة أخرى."
      });
    }

    return res.status(200).json({
      reply: reply
    });

  } catch (error) {
    console.error(
      "Elinfection chat function error:",
      error.name || "Error",
      error.message || "Unknown error"
    );

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "استغرقت الاستجابة وقتًا طويلًا. حاول مرة أخرى."
      });
    }

    return res.status(500).json({
      error: "حدث خطأ داخل الخادم أثناء معالجة السؤال. راجع سجلات Vercel."
    });
  }
};
