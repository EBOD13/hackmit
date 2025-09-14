import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import axios from "axios";
import { PlaceResult } from "./places-service";

export interface WeatherData {
  condition: string;
  temperature: number;
  description: string;
}

export interface QuestContext {
  currentTime: Date;
  weather: WeatherData | null;
  nearbyPOIs: PlaceResult[];
  recentQuestCategories: string[];
  userLocation: { lat: number; lng: number };
}

export interface AIGeneratedQuest {
  selectedPOIIndex: number;
  title: string;
  description: string;
  points: number;
  reasoning: string;
}

// Zod schema for structured output
const QuestGenerationSchema = z.object({
  selectedPOIIndex: z
    .number()
    .min(0)
    .describe("Index of the selected POI from the provided list"),
  title: z
    .string()
    .min(5)
    .describe("Creative quest title that includes the POI name"),
  description: z
    .string()
    .min(20)
    .describe("Engaging quest description with specific objectives"),
  points: z
    .number()
    .min(50)
    .describe("Point value based on quest difficulty and distance"),
  reasoning: z
    .string()
    .min(10)
    .describe(
      "Brief explanation of why this POI and quest make sense given the context"
    ),
});

export class AIQuestGenerator {
  private llm: ChatAnthropic;
  private weatherApiKey: string;

  constructor(anthropicApiKey: string, weatherApiKey: string) {
    this.llm = new ChatAnthropic({
      model: "claude-sonnet-4-20250514", // todo this is megaoverkill
      apiKey: anthropicApiKey,
      temperature: 0.65, // Creative but not too random
      maxTokens: 1000,
    });
    this.weatherApiKey = weatherApiKey;
  }

  /**
   * Get current weather for location
   */
  async getWeather(lat: number, lng: number): Promise<WeatherData | null> {
    if (
      !this.weatherApiKey ||
      this.weatherApiKey === "your_weather_api_key_here"
    ) {
      return null; // Skip weather if no API key
    }

    try {
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${this.weatherApiKey}&units=metric`
      );

      const weather = response.data;
      return {
        condition: weather.weather[0].main, // Clear, Rain, Snow, etc.
        temperature: Math.round(weather.main.temp),
        description: weather.weather[0].description,
      };
    } catch (error) {
      console.warn("Failed to fetch weather:", error);
      return null;
    }
  }

  /**
   * Format time with contextual flavor
   */
  private formatTimeWithFlavor(time: Date): string {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeStr = time.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    let flavor = "";
    if (hours >= 6 && hours < 10) {
      flavor = "morning";
    } else if (hours >= 10 && hours < 12) {
      flavor = "late morning";
    } else if (hours >= 12 && hours < 14) {
      flavor = "lunch time";
    } else if (hours >= 14 && hours < 17) {
      flavor = "afternoon";
    } else if (hours >= 17 && hours < 19) {
      flavor = "dinner time";
    } else if (hours >= 19 && hours < 22) {
      flavor = "evening";
    } else {
      flavor = "night";
    }

    return `${timeStr} (${flavor})`;
  }

  /**
   * Curate and randomize POI list for AI selection
   */
  private curatePOIList(pois: PlaceResult[]): PlaceResult[] {
    // Take top 15 by rating, then randomize the rest
    const sortedByRating = pois
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 15);

    // Shuffle the list to add variety
    for (let i = sortedByRating.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sortedByRating[i], sortedByRating[j]] = [
        sortedByRating[j],
        sortedByRating[i],
      ];
    }

    return sortedByRating;
  }

  /**
   * Generate AI-powered quest based on context
   */
  async generateQuest(context: QuestContext): Promise<AIGeneratedQuest> {
    const curatedPOIs = this.curatePOIList(context.nearbyPOIs);
    const timeWithFlavor = this.formatTimeWithFlavor(context.currentTime);

    // Build context string for the AI
    let contextStr = `Current time: ${timeWithFlavor}\n`;

    if (context.weather) {
      contextStr += `Weather: ${context.weather.condition}, ${context.weather.temperature}°C (${context.weather.description})\n`;
    }

    if (context.recentQuestCategories.length > 0) {
      contextStr += `Recent quest categories to avoid repeating: ${context.recentQuestCategories.join(
        ", "
      )}\n`;
    }

    contextStr += `\nAvailable POIs:\n`;
    curatedPOIs.forEach((poi, index) => {
      contextStr += `${index}. ${poi.name} - ${
        poi.formatted_address
      } (${poi.types.join(", ")})${
        poi.rating ? ` - Rating: ${poi.rating}/5` : ""
      }\n`;
    });

    const prompt = `You are a creative quest generator for a location-based adventure game. Given the current context and a list of nearby places, create an engaging quest that makes sense for the time, weather, and location.

${contextStr}

Guidelines:
- Choose ONE POI from the list by its index number (0-${curatedPOIs.length - 1})
- You are not allowed to make up POIs even if you're sure they would be better. If none of the POIs fit, choose the last one in the list.
- Create a quest that fits the current time, weather conditions, and POI type!!!
- The quest should be doable by a normal human without breaking any laws or safety rules!!! So like, no breaking into museums after hours.
- Generic quests like "Take a photo" or "Check in" are fine
- Avoid categories the user has done recently unless needed
- Make the quest specific and engaging with clear objectives
- Points should reflect difficulty: 50-75 (easy), 76-125 (medium), 126-200 (hard)
- Consider distance, time of day, and weather when assigning points
- If no POIs really apply, the last POI in the list is a safe option at the user's current location. At night, it should be "stargazing" or similar, during the day "people watching" (if in a city) or "picnic", in rain "indoor relaxation" or "cafe visit", etc.
- Quest descriptions should be less than 30 words long. The glasses these are displayed on only have room for 3 lines at a time, so scrolling should generally be kept to a minimum.

Generate a quest that would be fun and appropriate right now:`;

    try {
      // Use structured output with tool calling
      const structuredLLM = this.llm.withStructuredOutput(
        QuestGenerationSchema
      );

      const result = await structuredLLM.invoke(prompt);

      // Validate the selected POI index
      if (result.selectedPOIIndex >= curatedPOIs.length + 1) {
        throw new Error(
          `Invalid POI index: ${result.selectedPOIIndex}, max is ${
            curatedPOIs.length - 1
          }`
        );
      }
      console.log("AI-generated quest:", result);
      return result;
    } catch (error) {
      console.error("AI quest generation failed:", error);

      // Fallback to a simple random quest
      const randomIndex = Math.floor(Math.random() * curatedPOIs.length);
      const randomPOI = curatedPOIs[randomIndex];

      return {
        selectedPOIIndex: randomIndex,
        title: `Explore ${randomPOI.name}`,
        description: `Visit ${randomPOI.name} and spend some time exploring what they have to offer. Take in the atmosphere and enjoy the experience.`,
        points: 100,
        reasoning: "Fallback quest due to AI generation failure",
      };
    }
  }

  /**
   * Get recent quest categories for a user to avoid repetition
   */
  async getRecentQuestCategories(
    database: any,
    userId: string,
    limit: number = 3
  ): Promise<string[]> {
    try {
      // This would need to be implemented in the database layer
      // For now, return empty array
      return [];
    } catch (error) {
      console.warn("Failed to get recent quest categories:", error);
      return [];
    }
  }
}
