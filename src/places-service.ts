import { Client } from '@googlemaps/google-maps-services-js';
import { QuestDatabase, POICache } from './database';

export interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
  rating?: number;
  price_level?: number;
}

export interface QuestLocation {
  place: PlaceResult;
  category: string;
  questType: 'food' | 'exercise' | 'culture' | 'exploration' | 'shopping';
}

export class GooglePlacesService {
  private client: Client;
  private apiKey: string;
  private database: QuestDatabase;

  // Quest type to Google Places type mapping
  private questTypeMapping = {
    food: ['restaurant', 'cafe', 'bakery', 'food'],
    exercise: ['gym', 'park', 'stadium', 'hiking_area'],
    culture: ['library', 'museum', 'art_gallery', 'book_store'],
    exploration: ['tourist_attraction', 'park', 'point_of_interest'],
    shopping: ['store', 'shopping_mall', 'supermarket']
  };

  constructor(apiKey: string, database: QuestDatabase) {
    this.client = new Client({});
    this.apiKey = apiKey;
    this.database = database;
  }

  /**
   * Find places near a location for quest generation
   */
  async findNearbyPlaces(
    lat: number,
    lng: number,
    questType: keyof typeof this.questTypeMapping,
    radiusMeters: number = 2000
  ): Promise<PlaceResult[]> {
    try {
      const placeTypes = this.questTypeMapping[questType];

      const response = await this.client.placesNearby({
        params: {
          location: { lat, lng },
          radius: radiusMeters,
          type: placeTypes[0], // Use primary type
          key: this.apiKey,
        },
      });

      if (response.data.status === 'OK') {
        const places = response.data.results
          .filter(place => place.place_id && place.name && place.geometry?.location)
          .map(place => ({
            place_id: place.place_id!,
            name: place.name!,
            formatted_address: place.formatted_address || place.vicinity || 'Address not available',
            geometry: {
              location: {
                lat: place.geometry!.location!.lat,
                lng: place.geometry!.location!.lng
              }
            },
            types: place.types || [],
            rating: place.rating,
            price_level: place.price_level
          }))
          .slice(0, 10); // Limit results

        // Cache the places in database
        for (const place of places) {
          await this.cachePlaceInDatabase(place, questType);
        }

        return places;
      } else {
        throw new Error(`Places API error: ${response.data.status}`);
      }
    } catch (error) {
      console.error('Error fetching nearby places:', error);
      throw error;
    }
  }

  /**
   * Get place details by place ID
   */
  async getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
    try {
      const response = await this.client.placeDetails({
        params: {
          place_id: placeId,
          fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types', 'rating', 'price_level'],
          key: this.apiKey,
        },
      });

      if (response.data.status === 'OK' && response.data.result) {
        const place = response.data.result;
        return {
          place_id: place.place_id!,
          name: place.name!,
          formatted_address: place.formatted_address || 'Address not available',
          geometry: {
            location: {
              lat: place.geometry!.location!.lat,
              lng: place.geometry!.location!.lng
            }
          },
          types: place.types || [],
          rating: place.rating,
          price_level: place.price_level
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching place details:', error);
      return null;
    }
  }

  /**
   * Find quest locations based on user's current location
   */
  async findQuestLocations(lat: number, lng: number, radiusMeters: number = 2000): Promise<QuestLocation[]> {
    const questTypes: (keyof typeof this.questTypeMapping)[] = ['food', 'exercise', 'culture', 'exploration'];
    const questLocations: QuestLocation[] = [];

    for (const questType of questTypes) {
      try {
        const places = await this.findNearbyPlaces(lat, lng, questType, radiusMeters);

        // Pick the best place for this quest type (highest rating or first result)
        const bestPlace = places.sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];

        if (bestPlace) {
          questLocations.push({
            place: bestPlace,
            category: questType,
            questType: questType
          });
        }
      } catch (error) {
        console.warn(`Error finding places for ${questType}:`, error);
      }
    }

    return questLocations;
  }

  /**
   * Generate a quest description based on place and category
   */
  generateQuestDescription(place: PlaceResult, questType: keyof typeof this.questTypeMapping): { title: string; description: string; points: number } {
    const descriptions = {
      food: {
        title: `Culinary Explorer: ${place.name}`,
        description: `Visit ${place.name} and try something new! Order a drink or snack and enjoy the local atmosphere. Take a moment to appreciate the flavors and ambiance.`,
        points: 100
      },
      exercise: {
        title: `Fitness Challenge: ${place.name}`,
        description: `Head to ${place.name} for some physical activity! Spend at least 10 minutes exercising, walking, or being active. Your body will thank you!`,
        points: 120
      },
      culture: {
        title: `Cultural Discovery: ${place.name}`,
        description: `Explore ${place.name} and discover something new! Spend time learning, reading, or appreciating art. Expand your mind and cultural horizons.`,
        points: 150
      },
      exploration: {
        title: `Adventure Quest: ${place.name}`,
        description: `Embark on an adventure to ${place.name}! Explore the area, take in the sights, and discover what makes this place special. Document your journey!`,
        points: 130
      },
      shopping: {
        title: `Shopping Mission: ${place.name}`,
        description: `Visit ${place.name} and browse around! Whether you're looking for something specific or just window shopping, enjoy the retail experience.`,
        points: 90
      }
    };

    return descriptions[questType] || descriptions.exploration;
  }

  /**
   * Cache a place in the database for future use
   */
  private async cachePlaceInDatabase(place: PlaceResult, questType: string): Promise<void> {
    try {
      await this.database.cachePOI({
        place_id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        place_type: questType,
        rating: place.rating,
        price_level: place.price_level
      });
    } catch (error) {
      // Ignore cache errors - not critical
      console.warn('Failed to cache place:', place.name, error);
    }
  }

  /**
   * Get cached places from database (fallback when API fails)
   */
  async getCachedNearbyPlaces(lat: number, lng: number, radiusKm: number = 5): Promise<POICache[]> {
    try {
      return await this.database.getPOIsNearLocation(lat, lng, radiusKm);
    } catch (error) {
      console.error('Error fetching cached places:', error);
      return [];
    }
  }
}