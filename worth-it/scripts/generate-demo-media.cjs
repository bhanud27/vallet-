// Original illustrations and silent animated product showcases. No external media or accounts.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { chromium } = require("@playwright/test");
const catalog = require("../src/lib/demoCatalog.json");
const root = path.join(__dirname, "../assets/demo");
function art(p) {
  const c = p.color,
    stroke = "#25312f";
  const shapes = {
    tee: `<path d="M155 65 L80 105 20 195 105 240 130 195 130 420 370 420 370 195 395 240 480 195 420 105 345 65 Q250 150 155 65Z" fill="${c}"/><path d="M194 77 Q250 125 306 77" fill="none" stroke="#151a1b" stroke-width="16"/><path d="M158 190V393M342 190V393" stroke="#fff" opacity=".13" stroke-width="3"/>`,
    shirt: `<path d="M165 60 L85 105 35 375 110 395 145 205 145 440 355 440 355 205 390 395 465 375 415 105 335 60Z" fill="${c}"/><path d="M165 60 L250 130 210 165 155 86 M335 60 L250 130 290 165 345 86" fill="#92b0b7"/><path d="M250 130V440M148 260H220V320H148" fill="none" stroke="#d3e0df" stroke-width="4"/>${[185, 235, 285, 335, 385].map((y) => `<circle cx="250" cy="${y}" r="4" fill="#e4ece7"/>`).join("")}`,
    pants: `<path d="M145 55 H355 L375 430 275 435 250 200 225 435 125 430Z" fill="${c}"/><path d="M145 85H355M250 85V200M143 220H212V300H135M288 220H357L363 300H288" fill="none" stroke="#3f4935" stroke-width="6"/><path d="M150 110Q155 160 205 160M350 110Q345 160 295 160" fill="none" stroke="#a0a68a" stroke-width="3"/>`,
    jeans: `<path d="M145 55 H355 L370 435 275 435 250 200 225 435 130 435Z" fill="${c}"/><path d="M145 85H355M250 85V200M155 105Q165 165 215 165M345 105Q335 165 285 165M150 430H220M280 430H350" fill="none" stroke="#c3b18d" stroke-width="4"/><path d="M180 185L170 390M320 185L330 390" stroke="#adc2d2" opacity=".18" stroke-width="18"/>`,
    hoodie: `<path d="M175 110 Q155 5 250 10 Q345 5 325 110 L405 150 465 400 390 420 350 235 350 450 150 450 150 235 110 420 35 400 95 150Z" fill="${c}"/><path d="M175 110Q250 205 325 110Q310 45 250 42Q190 45 175 110Z" fill="#9a5945"/><path d="M195 320H305L325 400H175Z" fill="#a7654d"/><path d="M215 150L205 260M285 150L295 260" stroke="#f3ded1" stroke-width="6"/>`,
    backpack: `<path d="M195 80V55Q250 5 305 55V80" fill="none" stroke="#665331" stroke-width="20"/><rect x="95" y="75" width="310" height="370" rx="80" fill="${c}"/><rect x="125" y="250" width="250" height="165" rx="35" fill="#b7863f"/><path d="M155 235H345M158 290H342" stroke="#f6d99e" stroke-width="8"/><rect x="230" y="160" width="40" height="50" rx="9" fill="#f5e3b8"/>`,
    earbuds: `<rect x="80" y="255" width="340" height="165" rx="75" fill="#ced9d1"/><rect x="85" y="240" width="330" height="90" rx="42" fill="${c}"/><path d="M120 295H380" stroke="#afbab4" stroke-width="4"/><circle cx="250" cy="377" r="7" fill="#4f8d6d"/><path d="M140 90Q125 50 175 45Q220 45 220 100Q220 140 185 140V215Q160 240 140 215Z M290 90Q275 50 325 45Q370 45 370 100Q370 140 335 140V215Q310 240 290 215Z" fill="${c}" stroke="#b8c9be" stroke-width="3"/><ellipse cx="178" cy="98" rx="16" ry="24" fill="#7e8b82"/><ellipse cx="328" cy="98" rx="16" ry="24" fill="#7e8b82"/>`,
    headphones: `<path d="M100 280V200Q100 30 250 30Q400 30 400 200V280" fill="none" stroke="${c}" stroke-width="42"/><path d="M115 190Q115 62 250 62Q385 62 385 190" fill="none" stroke="#666b77" stroke-width="16"/><rect x="55" y="230" width="110" height="200" rx="42" fill="${c}"/><rect x="335" y="230" width="110" height="200" rx="42" fill="${c}"/><rect x="112" y="247" width="45" height="165" rx="18" fill="#757c87"/><rect x="343" y="247" width="45" height="165" rx="18" fill="#757c87"/>`,
    watch: `<rect x="195" y="5" width="110" height="480" rx="32" fill="${c}"/><rect x="135" y="115" width="230" height="260" rx="55" fill="#73847c"/><rect x="149" y="129" width="202" height="232" rx="44" fill="#152420"/><circle cx="250" cy="245" r="69" fill="none" stroke="#d8f06a" stroke-width="15" stroke-dasharray="330 105"/><path d="M250 205V245L278 264" fill="none" stroke="#edf4e9" stroke-width="10" stroke-linecap="round"/><rect x="365" y="192" width="15" height="46" rx="6" fill="#73847c"/>`,
    powerbank: `<rect x="120" y="75" width="260" height="355" rx="45" fill="${c}"/><rect x="120" y="75" width="260" height="58" rx="25" fill="#89799e"/><rect x="170" y="92" width="70" height="20" rx="5" fill="#30303b"/><rect x="270" y="92" width="42" height="20" rx="8" fill="#30303b"/><path d="M270 200L215 285H250L225 350L295 260H260Z" fill="#f2eefa"/>`,
    bottle: `<rect x="190" y="20" width="120" height="65" rx="18" fill="#283e39"/><path d="M190 75H310V120Q350 145 350 200V405Q350 455 300 455H200Q150 455 150 405V200Q150 145 190 120Z" fill="${c}"/><path d="M190 190V395" stroke="#96bcb1" stroke-width="18" stroke-linecap="round"/><path d="M220 18V2H305Q365 2 357 75" stroke="#283e39" stroke-width="15" fill="none"/>`,
    lamp: `<ellipse cx="255" cy="435" rx="160" ry="25" fill="${c}"/><path d="M255 420V265L135 150L280 65" stroke="#746647" stroke-width="22" stroke-linejoin="round" fill="none"/><path d="M270 45Q370 25 407 150L248 194Q215 100 270 45Z" fill="${c}"/><path d="M251 183L397 145" stroke="#fff3ca" stroke-width="15"/><circle cx="255" cy="265" r="22" fill="${c}"/>`,
    keyboard: `<rect x="25" y="150" width="450" height="230" rx="25" fill="${c}"/>${Array.from({ length: 4 }, (_, r) => Array.from({ length: 10 }, (_, i) => `<rect x="${45 + i * 41}" y="${170 + r * 42}" width="32" height="31" rx="5" fill="${r === 3 && i === 9 ? "#86725b" : "#f6f1e9"}"/>`).join("")).join("")}<rect x="135" y="340" width="235" height="20" rx="6" fill="#f6f1e9"/>`,
    shorts: `<path d="M125 80H375L405 365L265 395L250 235L235 395L95 365Z" fill="${c}"/><path d="M127 110H373M250 110V235M137 160L160 325M363 160L340 325" fill="none" stroke="#9eb5b9" stroke-width="5"/><path d="M238 115L225 180M260 115L275 180" stroke="#f0f0dc" stroke-width="6"/>`,
    mat: `<path d="M135 115H410L330 430H55Z" fill="${c}"/><ellipse cx="277" cy="115" rx="142" ry="56" fill="#c9adc0"/><ellipse cx="277" cy="115" rx="105" ry="35" fill="#8d6883"/><ellipse cx="277" cy="115" rx="69" ry="20" fill="#c9adc0"/><path d="M115 225H365M100 275H350M85 325H335M70 375H320" stroke="#d4b9cb" stroke-width="4" opacity=".6"/>`,
    glasses: `<path d="M55 195L20 145M445 195L480 145M205 220Q250 190 295 220" fill="none" stroke="${c}" stroke-width="16"/><ellipse cx="130" cy="245" rx="90" ry="85" fill="#4d514c" stroke="${c}" stroke-width="18"/><ellipse cx="370" cy="245" rx="90" ry="85" fill="#4d514c" stroke="${c}" stroke-width="18"/><path d="M80 210L165 270M320 210L405 270" stroke="#abb3a2" stroke-width="18" opacity=".35"/>`,
    tote: `<path d="M165 180V100Q165 15 250 15Q335 15 335 100V180" fill="none" stroke="#968260" stroke-width="22"/><path d="M100 150H400L430 445H70Z" fill="${c}"/><path d="M115 175L92 420H408L385 175" stroke="#e9d9bc" stroke-width="5" fill="none"/><circle cx="250" cy="290" r="65" fill="#a39371"/><path d="M225 305Q245 225 280 270Q290 300 225 305" fill="#e7dfbd"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="${p.background}"/><stop offset="1" stop-color="#f7f5ee"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dy="16" stdDeviation="12" flood-opacity=".16"/></filter></defs><rect width="800" height="800" fill="url(#bg)"/><ellipse cx="400" cy="665" rx="220" ry="26" fill="#1e2925" opacity=".09"/><g transform="translate(150 135)" filter="url(#shadow)" stroke-linecap="round" stroke-linejoin="round">${shapes[p.shape] || ""}</g></svg>`;
}
async function main() {
  fs.mkdirSync(root, { recursive: true });
  for (const p of catalog.products) {
    const svg = art(p);
    fs.writeFileSync(path.join(root, p.image + ".svg"), svg);
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(root, p.image + ".png"));
  }
  console.log("17 original product illustrations generated.");
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    for (const reel of catalog.reels) {
      const product = catalog.products.find((p) => p.id === reel.pollId);
      const png = fs
        .readFileSync(path.join(root, product.image + ".png"))
        .toString("base64");
      const encoded = await page.evaluate(
        async ({ png, product }) => {
          const canvas = document.createElement("canvas");
          canvas.width = 540;
          canvas.height = 810;
          const ctx = canvas.getContext("2d");
          const img = new Image();
          img.src = "data:image/png;base64," + png;
          await img.decode();
          const type = [
            "video/mp4;codecs=avc1.42E01E",
            "video/mp4;codecs=avc1",
            "video/mp4",
          ].find((m) => MediaRecorder.isTypeSupported(m));
          if (!type) throw new Error("This browser cannot encode MP4.");
          const stream = canvas.captureStream(24),
            recorder = new MediaRecorder(stream, {
              mimeType: type,
              videoBitsPerSecond: 750000,
            }),
            chunks = [];
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          const stopped = new Promise((resolve, reject) => {
            recorder.onstop = resolve;
            recorder.onerror = reject;
          });
          recorder.start();
          const started = performance.now();
          await new Promise((resolve) => {
            function draw(now) {
              const t = Math.min(1, (now - started) / 3600);
              ctx.fillStyle = product.background;
              ctx.fillRect(0, 0, 540, 810);
              const size = 490 + 20 * Math.sin(t * Math.PI);
              ctx.drawImage(
                img,
                (540 - size) / 2,
                135 + 8 * Math.sin(t * 2 * Math.PI),
                size,
                size,
              );
              ctx.fillStyle = "#232737";
              ctx.font = "700 18px Arial";
              ctx.fillText("WORTH IT?  /  SAMPLE STUDIO", 28, 48);
              ctx.font = "700 25px Arial";
              const words = product.name.split(" ");
              let line = "",
                y = 680;
              for (const word of words) {
                if (ctx.measureText(line + word).width > 480) {
                  ctx.fillText(line, 28, y);
                  line = "";
                  y += 32;
                }
                line += word + " ";
              }
              ctx.fillText(line, 28, y);
              ctx.font = "700 21px Arial";
              ctx.fillText(
                "Rs " + product.price.toLocaleString("en-IN"),
                28,
                y + 42,
              );
              ctx.font = "15px Arial";
              ctx.fillText("Fictional product / demo prices", 28, 785);
              ctx.fillStyle = "#c5ceaa";
              ctx.fillRect(28, 90, 484, 3);
              ctx.fillStyle = "#41356f";
              ctx.fillRect(28, 90, 484 * t, 3);
              if (t < 1) requestAnimationFrame(draw);
              else resolve();
            }
            requestAnimationFrame(draw);
          });
          recorder.stop();
          await stopped;
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(chunks, { type: "video/mp4" });
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        },
        { png, product },
      );
      const file = path.join(root, reel.video + "-reel.mp4");
      fs.writeFileSync(file, Buffer.from(encoded, "base64"));
      console.log(
        reel.video + ": " + Math.round(fs.statSync(file).size / 1024) + " KB",
      );
    }
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
