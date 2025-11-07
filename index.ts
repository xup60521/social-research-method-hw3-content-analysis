import { input, select } from "@inquirer/prompts";
import { scrapeContent } from "./src/scrapePage";
import { aiFunction } from "./src/aiFunction";
import fs from "fs/promises";

const prompt = `
你是一位專業的社會科學研究助理，擅長從網頁中擷取資訊並進行分析。
你正在進行內容分析的研究，針對新聞報導的內文和圖片進行深入分析。
可能的編碼如下：
 - 加害者性別
 - 加害人前綴 (例如：狼師、男教練、遊艇大亨...等)
 - 加害者姓名
 - 加害人前綴的形容詞
 - 受害者性別
 - 受害人前綴
 - 兒童年紀
 - 是否有圖片
 - 圖片人物性別
 - 圖片中人物性別對應的角色（e.g. 加害者、受害者、旁觀者...等）
你會根據提供的新聞內文和圖片進行編碼，並以結構化的方式回覆。請以 JSON 格式回覆，範例如下：
{
    "加害者性別": "男",
    "加害人前綴": "狼師",
    "加害者姓名": "張三",
    "加害人前綴的形容詞": "可惡的",
    "受害者性別": "女",
    "受害人前綴": "小女孩",
    "兒童年紀": "8歲",
    "是否有圖片": "有",
    "圖片人物性別": "男",
}
    若該變數沒有相對應的值（例如：無法判斷性別），則請回傳空字串 "" 作為該變數的值。
`

async function main() {
    const actionOptions = [
        {
            name: "Fetch Page Content from URLs (separated by space)",
            value: "fetch_page_content",
        },
        {
            name: "AI Does Content Analysis",
            value: "ai_content_analysis",
        },
    ];

    const action = await select({
        message: "Select an action:",
        choices: actionOptions,
    });

    switch (action) {
        case "fetch_page_content": {
            // urls are from urls.txt
            const urls = (await fs.readFile("urls.txt", "utf-8"))
                .split(" ")
                .map((url: string) => url.trim())
                .filter((url: string) => url.length > 0);
            await fetch_page_content(urls);
            break;
        }
        case "ai_content_analysis": {
            const prompt = "Analyze the content and provide insights.";
            await aiFunction(prompt);
            break;
        }
    }
}
async function fetch_page_content(urls: string[]) {
    for (const url of urls) {
        console.log(`Fetching content from: ${url}`);
        await scrapeContent(url);
    }
}


main()