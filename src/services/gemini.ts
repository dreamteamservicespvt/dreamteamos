const GEMINI_API_KEY = "AIzaSyA_Y0dPmUZaYuz7WLritE1n4ayHHB7LiKY";

export interface VerificationResult {
  videoCount: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

export async function verifyScreenshot(imageUrl: string): Promise<VerificationResult> {
  // Fetch image as base64
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

  const mimeType = blob.type || "image/png";
  const base64Data = base64.split(",")[1];

  const result = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: `Analyze this Google Drive screenshot. Count the number of video files visible (look for .mp4, .mov, .avi extensions or video thumbnails). Return ONLY valid JSON: {"videoCount": <number>, "confidence": "high|medium|low", "notes": "<what you see>"}`,
              },
            ],
          },
        ],
      }),
    }
  );

  if (!result.ok) {
    throw new Error(`Gemini API error: ${result.status}`);
  }

  const data = await result.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return { videoCount: 0, confidence: "low", notes: "Could not parse AI response" };
  }
}
