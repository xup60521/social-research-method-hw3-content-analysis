import { Cookie } from "bun";
import iconv from "iconv-lite";
import { load } from "cheerio";
import fs from "fs/promises";
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import CDP from "chrome-remote-interface";

export async function scrapeContent(
    url: string
): Promise<{ content: string; imageArrayBuffer: Buffer | null }> {
    const cookieStr = await fs.readFile("cookie", "utf-8");
    // 建立 WebDriver 並啟用 remote debugging（讓我們可以用 CDP 攔截 network response）
    const cdpPort = 9222;
    const chromeOptions = new chrome.Options().addArguments(
        `--remote-debugging-port=${cdpPort}`,
        "--disable-gpu"
    ) as chrome.Options;
    const driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(chromeOptions)
        .build();

    try {
        // 先導航到網站 origin，再注入 cookie，最後載入完整 URL
        const origin = new URL(url).origin;
        await driver.get(origin);

        // 解析 cookie 字串並逐一加入瀏覽器 session
        // cookieStr 來源在檔案頂端: const cookieStr = await fs.readFile("cookie", "utf-8");
        const rawCookies = cookieStr
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean);
        for (const raw of rawCookies) {
            const idx = raw.indexOf("=");
            if (idx <= 0) continue; // 非法 cookie
            const name = raw.slice(0, idx).trim();
            const value = raw.slice(idx + 1).trim();
            try {
                // 加入 cookie 到當前 domain (origin)
                await driver.manage().addCookie({ name, value });
            } catch (e) {
                console.warn("addCookie failed for", name, e);
            }
        }

        // 當 cookie 注入完成後，使用 CDP 攔截 network 回應，然後載入完整頁面以便請求帶上 cookie
        const cdp = await CDP({ port: cdpPort });
        await cdp.Network.enable();

        let imageBase64: string | null = null;
        // 攔截第一個回應網址其 path 開頭為 /ShowPhoto 的 image 回應
        let captured = false;
        cdp.Network.responseReceived(async (params: any) => {
            try {
                const resp = params.response;
                if (
                    !resp ||
                    !resp.mimeType ||
                    !resp.mimeType.startsWith("image/")
                )
                    return;

                const fullUrl: string = resp.url || "";
                // 嘗試解析 pathname；如果解析失敗，退回以原始 url 做簡單匹配
                let pathname = "";
                try {
                    pathname = new URL(fullUrl).pathname || "";
                } catch (e) {
                    pathname = fullUrl;
                }

                // 若 pathname 以 /ShowPhoto 開頭，或 url 中包含 'ShowPhoto'（不區分大小寫），則攔截
                if (
                    !(
                        pathname.startsWith("/ShowPhoto") ||
                        /ShowPhoto/i.test(fullUrl)
                    )
                )
                    return;

                if (captured) return;
                try {
                    const body = await cdp.Network.getResponseBody({
                        requestId: params.requestId,
                    });
                    if (body) {
                        if (body.base64Encoded) {
                            imageBase64 = body.body;
                        } else {
                            imageBase64 = Buffer.from(
                                body.body,
                                "utf-8"
                            ).toString("base64");
                        }
                        captured = true;
                    }
                } catch (e) {
                    // ignore per-request errors
                }
            } catch (e) {
                // ignore listener errors
            }
        });

        await driver.get(url);

        // 等待 .story-content 元素載入
        const storyContent = await driver.wait(
            until.elementLocated(By.css(".story-content")),
            10000
        );
        // 儲存 story-content 的 outerHTML（含圖片標籤等）
        const storyHtml = await driver.executeScript<string>(
            "return document.querySelector('.story-content') ? document.querySelector('.story-content').outerHTML : null;"
        );
        const storyText = await storyContent.getText();

        await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待 2 秒，確保圖片載入完成
        // 使用 CDP 攔截的 imageBase64（如有）寫入檔案，並同時保存 story-content 的 HTML
        // 等待 imageBase64（若有）或直到 timeout

        // 保存 story-content 的 HTML 並取出標題
        const $ = load(storyHtml);
        const title = $("h1").text().trim();
        const date = $(".story-source").text().trim();
        
        console.log("Title:", title);

        try {
            await ensureDir(`./output/${title}`);
        } catch (error) {
            console.error(
                `Error ensuring directory "./output/${title}":`,
                error
            );
        }

        await fs.writeFile(
            `./output/${title}/${title}.html`,
            storyHtml,
            "utf-8"
        );
        // save url as url.txt
        await fs.writeFile(`./output/${title}/url.txt`, url, "utf-8");
        // save date.txt
        await fs.writeFile(`./output/${title}/date.txt`, date, "utf-8");

        // 等待最多 6 秒讓 CDP 收到 image response
        const timeoutMs = 6000;
        const start = Date.now();
        while (!imageBase64 && Date.now() - start < timeoutMs) {
            await new Promise((r) => setTimeout(r, 200));
        }

        if (imageBase64) {
            await fs.writeFile(
                `./output/${title}/${title}.jpg`,
                Buffer.from(imageBase64, "base64")
            );
        }

        // 關閉 CDP 連線
        try {
            await cdp.close();
        } catch (e) {
            /* ignore */
        }

        return {
            content: storyText,
            imageArrayBuffer: imageBase64
                ? Buffer.from(imageBase64, "base64")
                : null,
        };
    } finally {
        // 關閉瀏覽器
        await driver.quit();
    }
}

// const response = await fetch(url, fetchOptions);
// const arrayBuffer = await response.arrayBuffer();
// const buffer = Buffer.from(arrayBuffer);
// const htmlContent = iconv.decode(buffer, "big5");

// const $ = load(htmlContent);

// const title = $(".story-title").text();
// console.log(title);

// await fs.writeFile("response.html", htmlContent, "utf-8");

async function ensureDir(path: string) {
    try {
        const stats = await fs.stat(path);
        if (!stats.isDirectory()) {
            throw new Error(`"${path}" exists and is not a directory.`);
        }
        // Directory exists, nothing to do
    } catch (err: any) {
        if (err.code === "ENOENT") {
            // Path does not exist, safe to create
            await fs.mkdir(path, { recursive: true });
        } else {
            // Some other error (e.g., permission denied)
            throw err;
        }
    }
}
