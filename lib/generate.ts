import OpenAI, { toFile } from 'openai';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const DARK_PROMPT = `Transform this photo into a cinematic lifestyle/editorial campaign aesthetic while preserving the authentic realism of the original image.

The final result should feel like a real photographed moment from a premium Gen Z wellness, fashion, music, wellness, travel, or lifestyle brand campaign — never overly AI-generated, plastic, fake, or hyper-rendered.

The image must ALWAYS look like a real iPhone photograph, captured naturally by a creative director or friend, candid and spontaneous, emotionally aesthetic, premium but effortless, modern, minimal, and editorial.

MAIN VIBE: effortless cool, candid luxury, sporty wellness energy, dreamy editorial photography, spontaneous real-life moments, modern feminine/creative aura, Pinterest + magazine campaign aesthetic, emotional but minimal, elevated everyday life, fashion campaign meets photo dump, luxury without trying too hard, authentic human atmosphere.

IMPORTANT: Preserve the original identity, facial structure, body proportions, pose, clothing silhouette, and natural imperfections of the person. DO NOT create fake AI beauty, over-smooth skin, over-sharpen details, make the image look CGI, create unrealistic lighting, or make the person look different.

IPHONE PHOTO FEEL: authentic mobile camera realism, natural smartphone sharpness, slightly imperfect candid framing, casual spontaneous composition, realistic skin texture, subtle motion blur, realistic dynamic range, natural lighting imperfections, slightly blown highlights in bright areas, realistic shadows, social media "captured moment" feeling, premium editorial iPhone aesthetic.

STYLING RULE: Automatically restyle outfit colors into minimal luxury palette. Clothing should be primarily black, occasionally white, monochromatic, minimal and fashion-editorial. Black clothing preferred in most outputs.

EDITING STYLE: soft vintage digital camera feeling, cinematic lighting, dreamy soft shadows, subtle film grain texture, warm authentic atmosphere, slightly faded highlights, rich but realistic tones, subtle blur and motion feeling, premium editorial depth, natural imperfections, aesthetic but believable, realism above everything.

COLOR GRADING: Create a cohesive cinematic palette. Adapt naturally to the environment, feel emotional and atmospheric, maintain realistic skin tones, preserve realistic contrast, feel like luxury campaign photography, never oversaturate colors.

TEXT OVERLAY: Add elegant poetic lowercase text fragments using Inter font ONLY. Font weight 300 Light, text transform lowercase, font size 20px, line height 1.35, letter spacing -0.02em. Use 4-7 short fragments of 2-6 words each. Place asymmetrically. Never place text over the face. Text color white or black based on contrast.

TEXT MOOD: wellness, movement, creativity, confidence, softness, slow living, feminine energy, emotional storytelling, intentional living, luxury wellness branding. Examples: "nothing louder than confidence", "movement as self respect", "wellness is not a destination", "made for slow living", "your energy introduces you first", "becoming her slowly", "softness is power", "calm looks good on you", "less noise more feeling".

BRAND INTEGRATION: Integrate the Woeva logo (the W shape from the reference) as abstract flowing lime green graphic lines. Lines must be EXTRA WIDE with smooth rounded edges, same thickness as the logo. Lines should wrap naturally around the subject, flow organically, partially frame the body, disappear behind objects naturally. The W logo mark can appear subtly in a small corner.

Use the reference image as the exact style template — match the dark editorial mood, the lime green line aesthetic, the Inter text placement, and the overall composition feel.

MOST IMPORTANT: The output must ALWAYS look like a REAL photograph with tasteful editorial design — never obvious AI art.`;

const LIGHT_PROMPT = `Transform this photo into a bright cinematic lifestyle/editorial campaign aesthetic while preserving the authentic realism of the original image.

The final result should feel like a real photographed moment from a premium Gen Z wellness, fashion, music, travel, festival, or lifestyle brand campaign — never overly AI-generated, plastic, fake, or hyper-rendered.

This version is specifically for BRIGHT / LIGHT / SUNNY images. The final image should feel airy, sunlit, fresh, warm, effortless, naturally overexposed in a beautiful way, emotionally light, socially alive, premium but spontaneous.

The image must ALWAYS look like a real iPhone photograph, captured naturally, candid and spontaneous, premium but effortless, modern, minimal, and editorial.

MAIN VIBE: carefree luxury, bright festival energy, sporty wellness aesthetic, dreamy summer photography, warm social atmosphere, elevated candid moments, modern Gen Z energy, Pinterest + magazine campaign aesthetic.

IMPORTANT: Preserve the original identity, facial structure, body proportions, pose, clothing silhouette, and natural imperfections. DO NOT darken the image into moody tones.

BRIGHT AESTHETIC: soft bright whites, creamy highlights, warm sunlight, soft skin glow, light neutral tones, airy summer atmosphere, slightly washed editorial colors, premium bright campaign aesthetic.

IPHONE PHOTO FEEL: authentic mobile camera realism, natural smartphone sharpness, slightly imperfect candid framing, casual spontaneous composition, realistic skin texture, natural motion blur, bright soft highlights, slightly faded whites, warm realistic sunlight.

STYLING RULE: Clothing should be primarily black, occasionally white, monochromatic, minimal fashion-editorial, sporty luxury aesthetic. Black clothing dominates even in bright images.

EDITING STYLE: bright cinematic photography, soft vintage digital camera feel, subtle film grain texture, dreamy sunlight, airy shadows, soft faded highlights, natural motion feeling, slightly imperfect candid composition, warm authentic atmosphere.

TEXT OVERLAY: Add elegant poetic lowercase text fragments using Inter font ONLY. Font weight 300 Light, lowercase, font size 20px, line height 1.35, letter spacing -0.02em. For BRIGHT images text color is BLACK ONLY. Use 4-7 short fragments of 2-6 words. Asymmetrical editorial placement. Never place text over faces.

TEXT MOOD: freedom, movement, summer, confidence, softness, creativity, friendship, festival culture, modern lifestyle. Examples: "nothing louder than confidence", "future memories", "summer feels different here", "less noise more feeling", "softness is power", "living beautifully on purpose".

BRAND INTEGRATION: Integrate the Woeva logo (the W shape from the reference) as abstract flowing lime green graphic lines. Lines must be EXTRA WIDE with smooth rounded edges, same thickness as the logo. Lines wrap naturally around the subjects, flow organically, partially frame the composition.

Use the reference image as the exact style template — match the lime green line aesthetic, the Inter text placement, and the overall composition feel, but keep the BRIGHT/AIRY mood.

MOST IMPORTANT: The output must ALWAYS look like a REAL bright iPhone photograph with tasteful editorial design — never obvious AI art.`;

export async function generateOscarImage(photoUrl: string, style: 'dark' | 'light'): Promise<{ imageBase64: string; caption: string }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Load photo from URL
  const photoRes = await fetch(photoUrl);
  const photoBuffer = Buffer.from(await photoRes.arrayBuffer());

  // Load logo and reference from bundled assets
  const assetsDir = path.join(process.cwd(), 'public', 'assets');
  const logoBuffer = fs.readFileSync(path.join(assetsDir, 'logo.png'));
  const referenceBuffer = fs.readFileSync(path.join(assetsDir, 'reference.png'));

  const prompt = style === 'dark' ? DARK_PROMPT : LIGHT_PROMPT;

  // Call OpenAI gpt-image-1 with 3 images: photo + logo + reference
  const result = await openai.images.edit({
    model: 'gpt-image-1',
    image: [
      await toFile(photoBuffer, 'photo.jpg', { type: 'image/jpeg' }),
      await toFile(logoBuffer, 'logo.png', { type: 'image/png' }),
      await toFile(referenceBuffer, 'reference.png', { type: 'image/png' }),
    ],
    prompt,
    size: '1024x1536',
    n: 1,
  } as Parameters<typeof openai.images.edit>[0]);

  const rawBuffer = Buffer.from(result.data![0].b64_json!, 'base64');
  const resizedBuffer = await sharp(rawBuffer)
    .resize(1080, 1350, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const imageBase64 = resizedBuffer.toString('base64');

  // Generate short caption
  const captionRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Write an Instagram caption in Slovak for Woeva — a free community events app. The post is a ${style} aesthetic lifestyle editorial photo.

Style rules:
- Emotional, poetic, short lines (2-5 words per line), line breaks between thoughts
- Evokes a feeling or mood that matches the image — NOT always about events directly
- Captures a feeling like: being glad you went out, good energy, good people, spontaneous moments, not staying home
- Ends with a simple CTA: "Downloadni si Woeva.\nApp Store & Google Play."
- Add 1 fitting emoji at the end of the first stanza (not in CTA)
- No hashtags, no English, no formal language — casual, warm, Gen Z Slovak
- Total length: 4-7 short lines + the CTA

Examples of the feeling/tone to match:
"Niekedy ani nejde o ten event.\nIde o ten pocit,\nkeď si rád,\nže si neostal doma. ✨\n\nDownloadni si Woeva.\nApp Store & Google Play."

"Väčšina dobrých spomienok\nzačína vetou:\n„Tak poďme." 🌙\n\nDownloadni si Woeva.\nApp Store & Google Play."

"Niektoré dni nepotrebujú plán.\nStačí dobrá energia\na správni ľudia. 🤍\n\nDownloadni si Woeva.\nApp Store & Google Play."`,
    }],
    max_tokens: 120,
  });

  const caption = captionRes.choices[0].message.content?.trim() || 'discover what\'s happening near you → woeva app';

  return { imageBase64, caption };
}
