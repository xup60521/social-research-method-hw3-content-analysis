import { Cookie } from "bun";
import iconv from "iconv-lite";
import { load } from "cheerio";
import fs from "fs/promises";

const cookieStr = await fs.readFile("cookie", "utf-8");

const fetchOptions = {
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36",
        Cookie: cookieStr,
    },
};
const url =
    "https://udndata.com/ndapp/Story?no=1&page=1&udndbid=udndata&SearchString=qcqrSSuk6bTBPj0yMDI1MTAwOCuk6bTBPD0yMDI1MTEwNiuz+KdPPcFwpliz+A==&sharepage=20&select=1&kind=2&article_date=2025-11-06&news_id=10613765";

const response = await fetch(url, fetchOptions);
const arrayBuffer = await response.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);
const htmlContent = iconv.decode(buffer, "big5");

const $ = load(htmlContent);

const title = $(".story-title").text();
console.log(title);

await fs.writeFile("response.html", htmlContent, "utf-8");
