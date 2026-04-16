import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ApparelDescription {
  name: string;
  description: string;
  color: {
    name: string;
    hex: string;
  };
  type: string;
  subtype: string;
  fabric: string;
  fit?: string;
  cutType?: string;
  designNote?: string;
  rotationDegrees: number | null;
}

/**
 * Dedicated rotation-detection call using gpt-4o.
 * Kept separate so the model can focus entirely on spatial orientation
 * without being distracted by generating other description fields.
 */
export async function detectApparelRotation(
  imageUrl: string,
): Promise<number | null> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a clothing orientation detector. Your ONLY job is to look at an image of a clothing item and determine whether it is upright or rotated.

Use these orientation rules:
- Tops / shirts / jackets / hoodies: collar or neckline must be at the TOP, hemline at the BOTTOM, sleeves extending left and right.
- Pants / jeans / shorts / skirts: waistband must be at the TOP, leg openings or hem at the BOTTOM.
- Dresses / jumpsuits: neckline at the TOP, hem at the BOTTOM.
- Shoes / boots / sneakers: sole facing DOWN, shoe opening facing UP.

If the item matches its expected upright orientation, return 0.
If it is rotated, return the clockwise degrees needed to correct it back to upright (e.g. 90, 180, 270, 45, -45).

Respond with ONLY a JSON object in this exact format: {"rotationDegrees": <number>}
No explanation, no markdown, no extra text.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Examine this clothing item. Is it upright or rotated? Return only the JSON.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 30,
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    console.log("🔄 Rotation detection raw response:", raw);

    const cleaned = raw.startsWith("```")
      ? raw.replace(/^```json?\s*\n?/, "").replace(/\n?```\s*$/, "")
      : raw;

    const parsed = JSON.parse(cleaned);
    return typeof parsed.rotationDegrees === "number"
      ? parsed.rotationDegrees
      : null;
  } catch (error) {
    console.error("❌ Rotation detection failed:", error);
    return null;
  }
}

/**
 * Generate a detailed clothing description using OpenAI's GPT-4o-mini Vision.
 * Rotation detection runs as a parallel gpt-4o call and is merged into the result.
 */
export async function generateApparelDescription(
  imageUrl: string,
): Promise<ApparelDescription> {
  try {
    console.log("🤖 Generating AI description for apparel image:", imageUrl);

    // Run description and rotation detection in parallel
    const [descriptionResponse, rotationDegrees] = await Promise.all([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this clothing item and provide a detailed description in JSON format with the following fields:

1. "name": A concise product name following this exact format: {Adjective} {Color} {Material/Style} {Subtype}
   Examples:
   - "Relaxed Navy Cotton Crew Neck"
   - "Distressed Black Skinny Jeans"
   - "Premium Leather Bomber Jacket"
   - "Classic White Oxford Shirt"
   - "Chunky Knit Wool Sweater"
   Keep it natural and descriptive, 3-5 words maximum.

2. "color": An object with "name" (one word primary color like "Blue", "Black", "Red") and "hex" (the hex code like "#0000FF", "#000000", "#FF0000")
3. "type": The main category of clothing (e.g., "Top", "Bottom", "Dress", "Outerwear", "Shoes")
4. "subtype": The specific type (e.g., "T-Shirt", "Jeans", "Sneakers", "Jacket")
5. "fabric": The apparent fabric or material (e.g., "Cotton", "Denim", "Polyester", "Wool", "Leather")
6. "fit": The fit style (e.g., "Slim", "Regular", "Loose", "Oversized", "Fitted")
7. "cutType": The cut or silhouette (e.g., "Crew Neck", "V-Neck", "Straight Leg", "Tapered", "A-Line")
8. "designNote": A brief style note (e.g., "Minimal", "Vintage", "Casual", "Formal", "Sporty")
9. "description": A comprehensive 20-22 word description that naturally incorporates the color, material, category, subcategory, fit, cut type, and design note. Make it flow naturally like a product description.

Example output:
{
  "name": "Relaxed Navy Cotton Crew Neck",
  "color": {"name": "Navy", "hex": "#000080"},
  "type": "Top",
  "subtype": "T-Shirt",
  "fabric": "Cotton",
  "fit": "Slim",
  "cutType": "Crew Neck",
  "designNote": "Casual",
  "description": "Navy cotton crew neck t-shirt with a slim fit design, perfect for casual everyday wear with minimalist aesthetic and comfortable feel"
}

Be accurate and detailed. Return ONLY valid JSON.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 450,
        temperature: 0.3,
      }),
      detectApparelRotation(imageUrl),
    ]);

    const content = descriptionResponse.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    console.log("📝 Raw OpenAI description response:", content);

    let cleanedContent = content.trim();
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent
        .replace(/^```json?\s*\n?/, "")
        .replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(cleanedContent);

    const result: ApparelDescription = {
      name: parsed.name || "Stylish Apparel Item",
      description: parsed.description || "Stylish clothing item",
      color: parsed.color || { name: "Unknown", hex: "#808080" },
      type: parsed.type || "Top",
      subtype: parsed.subtype || "Other",
      fabric: parsed.fabric || "Cotton",
      fit: parsed.fit,
      cutType: parsed.cutType,
      designNote: parsed.designNote,
      rotationDegrees,
    };

    console.log("✅ Generated apparel description:", result);
    return result;
  } catch (error) {
    console.error("❌ Error generating apparel description:", error);

    return {
      name: "Stylish Apparel Item",
      description: "Stylish clothing item",
      color: { name: "Unknown", hex: "#808080" },
      type: "Top",
      subtype: "Other",
      fabric: "Cotton",
      rotationDegrees: null,
    };
  }
}

/**
 * Generate a simple, concise description from AI analysis.
 */
export async function generateSimpleDescription(
  imageUrl: string,
): Promise<string> {
  try {
    const result = await generateApparelDescription(imageUrl);
    return result.description;
  } catch (error) {
    console.error("❌ Error generating simple description:", error);
    return "Stylish clothing item";
  }
}
