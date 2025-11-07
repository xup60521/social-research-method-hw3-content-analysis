import { createGoogleGenerativeAI } from "@ai-sdk/google";
import fs from "fs/promises";
import { generateText, type UserContent } from "ai";

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_KEY,
});

export async function aiFunction(prompt: string) {
    // read all the subfolders in ./output, the format is ./output/{title}/${title}.html
    // and potentially also .jpg
    const outputDir = "./output";
    const subfolders = await fs.readdir(outputDir);
    const result = [] as Record<string, string>[];
    for (const folder of subfolders) {
        const title = folder;
        const htmlPath = `${outputDir}/${title}/${title}.html`;
        const htmlContent = await fs.readFile(htmlPath, "utf-8");
        // read url.txt
        const url = await fs.readFile(`${outputDir}/${title}/url.txt`, "utf-8");
        const date = await fs.readFile(`${outputDir}/${title}/date.txt`, "utf-8");
        let promptContent = [{type: "text", text: prompt}, {type: "text", text: htmlContent}];
        const imagePath = `${outputDir}/${title}/${title}.jpg`;
        let imageBuffer: Buffer | null = null;
        try {
            imageBuffer = await fs.readFile(imagePath);
            promptContent = [...promptContent, {type: "image", image: imageBuffer}] as any;
        } catch (e) {
            // no image
        }

        const { text } = await generateText({
            model: google("gemini-2.5-flash-lite"),
            messages: [
                {
                    role: "user",
                    content: promptContent as UserContent,
                }
            ]
        })
        const responseObj = JSON.parse(text) as Record<string, string>;
        result.push({ title, url, date, ...responseObj });
    }
    // result should be an array of objects
    // save as csv
    const csvHeader = Object.keys(result[0] as Record<string, string>).join(",") + "\n";
    const csvRows = result.map(obj => {
        return Object.values(obj).map(value => {
            // escape double quotes
            const escaped = (value ?? "").toString().replace(/"/g, '""');
            return `"${escaped}"`;
        }).join(",");
    }).join("\n");
    // write to file
    await fs.writeFile("./output/result.csv", csvHeader + csvRows);
}


