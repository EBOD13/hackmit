import { QuestDatabase } from './database';

export class SampleQuestSeeder {
  private database: QuestDatabase;

  constructor(database: QuestDatabase) {
    this.database = database;
  }

  async seedHistoricalQuests(): Promise<void> {
    const historicalQuests = [
      {
        title: "Discover the Freedom Trail",
        description: "Follow the red brick path and learn about America's revolutionary history.",
        category: "historical",
        points: 150,
        location_name: "Boston Common",
        location_address: "139 Tremont St, Boston, MA 02111",
        location_lat: 42.3550,
        location_lng: -71.0662,
        weather_dependent: false,
        suitable_weather: ["sunny", "cloudy", "partly_cloudy"],
        indoor_activity: false,
        historical_significance: "Starting point of the 2.5-mile Freedom Trail, established in 1634 as America's first public park.",
        cultural_info: "",
        required_items: ["📱 Camera", "👟 Comfortable shoes"]
      },
      {
        title: "Explore Civil War Battlefields",
        description: "Walk the grounds where history was made and reflect on the sacrifices of the past.",
        category: "historical",
        points: 175,
        location_name: "Gettysburg National Military Park",
        location_address: "1195 Baltimore Pike, Gettysburg, PA 17325",
        location_lat: 39.8309,
        location_lng: -77.2319,
        weather_dependent: true,
        suitable_weather: ["sunny", "cloudy"],
        indoor_activity: false,
        historical_significance: "Site of the pivotal Civil War battle (July 1-3, 1863) that marked the turning point of the war.",
        cultural_info: "",
        required_items: ["🧢 Hat", "💧 Water bottle", "📖 Guidebook"]
      },
      {
        title: "Visit the Liberty Bell",
        description: "See the iconic symbol of American independence and learn about its cracked history.",
        category: "historical",
        points: 125,
        location_name: "Liberty Bell Center",
        location_address: "526 Market St, Philadelphia, PA 19106",
        location_lat: 39.9496,
        location_lng: -75.1503,
        weather_dependent: false,
        suitable_weather: ["any"],
        indoor_activity: true,
        historical_significance: "Commissioned in 1752, this bell became a symbol of freedom and independence for America.",
        cultural_info: "",
        required_items: []
      }
    ];

    for (const quest of historicalQuests) {
      try {
        await this.database.createQuestTemplate(quest);
        console.log(`Created historical quest: ${quest.title}`);
      } catch (error) {
        console.warn(`Failed to create quest ${quest.title}:`, error);
      }
    }
  }

  async seedCulturalQuests(): Promise<void> {
    const culturalQuests = [
      {
        title: "Experience Local Street Art",
        description: "Discover vibrant murals and street art that tell the story of the neighborhood.",
        category: "cultural",
        points: 100,
        location_name: "Wynwood Walls",
        location_address: "2520 NW 2nd Ave, Miami, FL 33127",
        location_lat: 25.8010,
        location_lng: -80.1990,
        weather_dependent: true,
        suitable_weather: ["sunny", "cloudy", "partly_cloudy"],
        indoor_activity: false,
        historical_significance: "",
        cultural_info: "Outdoor museum showcasing large-scale works by some of the world's best-known street artists.",
        required_items: ["📱 Camera", "🕶️ Sunglasses"]
      },
      {
        title: "Taste Authentic Local Cuisine",
        description: "Sample traditional dishes that represent the cultural heritage of this area.",
        category: "cultural",
        points: 120,
        location_name: "Chinatown Cultural District",
        location_address: "Grant Ave & Bush St, San Francisco, CA 94108",
        location_lat: 37.7909,
        location_lng: -122.4056,
        weather_dependent: false,
        suitable_weather: ["any"],
        indoor_activity: true,
        historical_significance: "",
        cultural_info: "Oldest Chinatown in North America, established in the 1840s, featuring authentic cuisine and cultural traditions.",
        required_items: ["💳 Payment method", "🍽️ Appetite"]
      },
      {
        title: "Attend a Cultural Performance",
        description: "Experience live music, dance, or theater that celebrates local artistic traditions.",
        category: "cultural",
        points: 150,
        location_name: "Lincoln Center",
        location_address: "10 Lincoln Center Plaza, New York, NY 10023",
        location_lat: 40.7722,
        location_lng: -73.9839,
        weather_dependent: false,
        suitable_weather: ["any"],
        indoor_activity: true,
        historical_significance: "",
        cultural_info: "World-renowned performing arts complex, home to the Metropolitan Opera, New York Philharmonic, and New York City Ballet.",
        required_items: ["🎫 Tickets", "👔 Appropriate attire"]
      },
      {
        title: "Explore Cultural Markets",
        description: "Browse local crafts, foods, and goods that showcase regional culture and traditions.",
        category: "cultural",
        points: 110,
        location_name: "Pike Place Market",
        location_address: "85 Pike St, Seattle, WA 98101",
        location_lat: 47.6089,
        location_lng: -122.3403,
        weather_dependent: true,
        suitable_weather: ["sunny", "cloudy", "partly_cloudy"],
        indoor_activity: false,
        historical_significance: "",
        cultural_info: "Historic public market opened in 1907, featuring local artisans, farmers, and the famous fish throwing tradition.",
        required_items: ["💳 Payment method", "🛍️ Shopping bag"]
      }
    ];

    for (const quest of culturalQuests) {
      try {
        await this.database.createQuestTemplate(quest);
        console.log(`Created cultural quest: ${quest.title}`);
      } catch (error) {
        console.warn(`Failed to create quest ${quest.title}:`, error);
      }
    }
  }

  async seedWeatherSpecificQuests(): Promise<void> {
    const weatherQuests = [
      {
        title: "Rainy Day Museum Adventure",
        description: "Explore fascinating exhibits while staying dry and comfortable indoors.",
        category: "indoor",
        points: 125,
        location_name: "Local Museum",
        location_address: "Museum District",
        location_lat: 0,
        location_lng: 0,
        weather_dependent: true,
        suitable_weather: ["rainy", "snowy"],
        indoor_activity: true,
        historical_significance: "",
        cultural_info: "Perfect activity for inclement weather - expand your knowledge while staying comfortable.",
        required_items: ["☂️ Umbrella", "🧥 Jacket"]
      },
      {
        title: "Sunny Day Park Exploration",
        description: "Enjoy the beautiful weather while discovering hidden gems in the local park.",
        category: "outdoor",
        points: 100,
        location_name: "City Park",
        location_address: "Park Avenue",
        location_lat: 0,
        location_lng: 0,
        weather_dependent: true,
        suitable_weather: ["sunny", "partly_cloudy"],
        indoor_activity: false,
        historical_significance: "",
        cultural_info: "Take advantage of great weather to connect with nature and get some fresh air.",
        required_items: ["🧴 Sunscreen", "💧 Water bottle", "🕶️ Sunglasses"]
      },
      {
        title: "Cozy Café Culture",
        description: "Experience local coffee culture while enjoying a warm, inviting atmosphere.",
        category: "indoor",
        points: 75,
        location_name: "Local Café",
        location_address: "Downtown District",
        location_lat: 0,
        location_lng: 0,
        weather_dependent: true,
        suitable_weather: ["rainy", "snowy", "cloudy"],
        indoor_activity: true,
        historical_significance: "",
        cultural_info: "Perfect for cold or rainy weather - enjoy local beverages and people-watching.",
        required_items: ["💳 Payment method", "📖 Book or device"]
      }
    ];

    for (const quest of weatherQuests) {
      try {
        await this.database.createQuestTemplate(quest);
        console.log(`Created weather-specific quest: ${quest.title}`);
      } catch (error) {
        console.warn(`Failed to create quest ${quest.title}:`, error);
      }
    }
  }

  async seedAllSampleQuests(): Promise<void> {
    console.log("Seeding sample quests...");
    await this.seedHistoricalQuests();
    await this.seedCulturalQuests();
    await this.seedWeatherSpecificQuests();
    console.log("Sample quest seeding completed!");
  }
}
