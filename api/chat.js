
export default async function handler(req, res) {
  // Allow POST requests only
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "الطريقة غير مسموح بها. استخدم POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "مفتاح Gemini غير مضبوط في إعدادات Vercel."
    });
  }

  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    const systemPrompt =
      typeof body.system === "string" && body.system.trim()
        ? body.system
        : `أنت Elinfection، مساعد ذكي متخصص في مكافحة العدوى
والوقاية منها والتثقيف الصحي.
أجب باللغة العربية الواضحة، ويفضل اللهجة المصرية عند ملاءمتها.
قدّم معلومات طبية دقيقة وآمنة، وميّز بين التثقيف العام
والتشخيص الطبي. لا تخترع معلومات أو مراجع.
في حالات الطوارئ، وجّه المستخدم لطلب المساعدة الطبية فورًا.
لا تطلب بيانات تعريفية للمرضى ولا تدّعِ أنك بديل للطبيب.`;

    const contents = messages
      .filter(
        (m) =>
          m &&
          typeof m.content === "string" &&
          ["user", "assistant", "model"].includes(m.role)
      )
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }]
      }))
      .filter((m) => m.parts[0].text.trim().length > 0);

    if (contents.length === 0) {
      return res.status(400).json({
        error: "اكتب رسالتك أولًا."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        response.status,
        data?.error?.message || "Unknown error"
      );

      if (response.status === 429) {
        return res.status(429).json({
          error:
            "وصلنا لحد الاستخدام المؤقت للمساعد. انتظر قليلًا ثم حاول مرة أخرى."
        });
      }

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error:
            "مفتاح Gemini غير صالح أو لا يملك صلاحية الاستخدام. راجع إعدادات Vercel."
        });
      }

      return res.status(502).json({
        error:
          "حصلت مشكلة في الاتصال بخدمة Gemini. حاول مرة أخرى لاحقًا."
      });
    }

    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error:
          "المساعد لم يُرجع إجابة. جرّب صياغة السؤال بطريقة مختلفة."
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Elinfection server error:", error.message);

    return res.status(500).json({
      error: "حصل خطأ داخلي. حاول مرة أخرى."
    });
  }
}
