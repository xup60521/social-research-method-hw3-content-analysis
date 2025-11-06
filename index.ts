import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_KEY,
});
const model = google("gemini-2.5-flash-lite");

const { text } = await generateText({
    model,
    prompt: "hello world! What's your name?",
});


