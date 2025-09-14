import { PlaceResult } from "./places-service";

export interface BusinessHours {
  isOpen: boolean;
  opensAt?: string;
  closesAt?: string;
  isOpen24Hours?: boolean;
  nextOpenTime?: Date;
  nextCloseTime?: Date;
}

export interface AccessibilityInfo {
  isAccessible: boolean;
  reason?: string;
  alternativeTime?: string;
}

export class BusinessHoursService {
  /**
   * Check if a POI is currently open based on its type and current time
   */
  checkBusinessHours(poi: PlaceResult, currentTime: Date = new Date()): BusinessHours {
    const dayOfWeek = currentTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    // Default business hours based on POI type
    const typeHours = this.getDefaultHoursForType(poi.types, dayOfWeek);
    
    if (typeHours.isOpen24Hours) {
      return {
        isOpen: true,
        isOpen24Hours: true
      };
    }

    if (!typeHours.openTime || !typeHours.closeTime) {
      // If we can't determine hours, assume it's accessible
      return {
        isOpen: true,
        opensAt: "Unknown",
        closesAt: "Unknown"
      };
    }

    const isCurrentlyOpen = currentTimeMinutes >= typeHours.openTime && currentTimeMinutes < typeHours.closeTime;
    
    return {
      isOpen: isCurrentlyOpen,
      opensAt: this.minutesToTimeString(typeHours.openTime),
      closesAt: this.minutesToTimeString(typeHours.closeTime),
      nextOpenTime: isCurrentlyOpen ? undefined : this.getNextOpenTime(currentTime, typeHours.openTime, dayOfWeek),
      nextCloseTime: isCurrentlyOpen ? this.getNextCloseTime(currentTime, typeHours.closeTime, dayOfWeek) : undefined
    };
  }

  /**
   * Check if a POI is accessible at the current time (considering safety, lighting, etc.)
   */
  checkAccessibility(poi: PlaceResult, currentTime: Date = new Date()): AccessibilityInfo {
    const currentHour = currentTime.getHours();
    const businessHours = this.checkBusinessHours(poi, currentTime);

    // Safety considerations for outdoor locations
    if (this.isOutdoorLocation(poi.types)) {
      if (currentHour < 6 || currentHour > 22) {
        return {
          isAccessible: false,
          reason: "Outdoor location not recommended during late night/early morning hours for safety",
          alternativeTime: "6:00 AM - 10:00 PM"
        };
      }
    }

    // Indoor locations that require business to be open
    if (this.requiresBusinessOpen(poi.types)) {
      if (!businessHours.isOpen) {
        return {
          isAccessible: false,
          reason: `Business is closed. Opens at ${businessHours.opensAt || 'unknown time'}`,
          alternativeTime: businessHours.opensAt
        };
      }
    }

    return {
      isAccessible: true
    };
  }

  /**
   * Filter POIs to only include those that are currently accessible
   */
  filterAccessiblePOIs(pois: PlaceResult[], currentTime: Date = new Date()): PlaceResult[] {
    return pois.filter(poi => {
      const accessibility = this.checkAccessibility(poi, currentTime);
      return accessibility.isAccessible;
    });
  }

  /**
   * Get POIs with their accessibility status for informed decision making
   */
  getPOIsWithAccessibility(pois: PlaceResult[], currentTime: Date = new Date()): Array<PlaceResult & { accessibility: AccessibilityInfo; businessHours: BusinessHours }> {
    return pois.map(poi => ({
      ...poi,
      accessibility: this.checkAccessibility(poi, currentTime),
      businessHours: this.checkBusinessHours(poi, currentTime)
    }));
  }

  private getDefaultHoursForType(types: string[], dayOfWeek: number): { openTime?: number; closeTime?: number; isOpen24Hours?: boolean } {
    const typeSet = new Set(types);

    // 24-hour locations
    if (typeSet.has('gas_station') || typeSet.has('convenience_store') || typeSet.has('hospital')) {
      return { isOpen24Hours: true };
    }

    // Parks and outdoor spaces
    if (typeSet.has('park') || typeSet.has('tourist_attraction') || typeSet.has('natural_feature')) {
      return { openTime: 6 * 60, closeTime: 22 * 60 }; // 6 AM - 10 PM
    }

    // Restaurants and food
    if (typeSet.has('restaurant') || typeSet.has('food') || typeSet.has('meal_takeaway') || typeSet.has('cafe')) {
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Weekend
        return { openTime: 8 * 60, closeTime: 23 * 60 }; // 8 AM - 11 PM
      }
      return { openTime: 7 * 60, closeTime: 22 * 60 }; // 7 AM - 10 PM
    }

    // Shopping
    if (typeSet.has('shopping_mall') || typeSet.has('store') || typeSet.has('clothing_store')) {
      if (dayOfWeek === 0) { // Sunday
        return { openTime: 11 * 60, closeTime: 19 * 60 }; // 11 AM - 7 PM
      }
      return { openTime: 10 * 60, closeTime: 21 * 60 }; // 10 AM - 9 PM
    }

    // Museums and cultural sites
    if (typeSet.has('museum') || typeSet.has('art_gallery') || typeSet.has('library')) {
      if (dayOfWeek === 1) { // Monday - often closed
        return { openTime: undefined, closeTime: undefined };
      }
      return { openTime: 10 * 60, closeTime: 17 * 60 }; // 10 AM - 5 PM
    }

    // Entertainment
    if (typeSet.has('movie_theater') || typeSet.has('bowling_alley') || typeSet.has('amusement_park')) {
      return { openTime: 12 * 60, closeTime: 24 * 60 }; // 12 PM - 12 AM
    }

    // Gyms and fitness
    if (typeSet.has('gym') || typeSet.has('spa')) {
      return { openTime: 5 * 60, closeTime: 23 * 60 }; // 5 AM - 11 PM
    }

    // Banks and professional services
    if (typeSet.has('bank') || typeSet.has('post_office') || typeSet.has('government')) {
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Weekend
        return { openTime: undefined, closeTime: undefined };
      }
      return { openTime: 9 * 60, closeTime: 17 * 60 }; // 9 AM - 5 PM
    }

    // Default business hours
    return { openTime: 9 * 60, closeTime: 18 * 60 }; // 9 AM - 6 PM
  }

  private isOutdoorLocation(types: string[]): boolean {
    const outdoorTypes = ['park', 'natural_feature', 'tourist_attraction', 'cemetery', 'campground'];
    return types.some(type => outdoorTypes.includes(type));
  }

  private requiresBusinessOpen(types: string[]): boolean {
    const businessTypes = ['store', 'restaurant', 'museum', 'bank', 'shopping_mall', 'library', 'post_office'];
    return types.some(type => businessTypes.includes(type));
  }

  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
  }

  private getNextOpenTime(currentTime: Date, openTimeMinutes: number, currentDayOfWeek: number): Date {
    const nextOpen = new Date(currentTime);
    const currentTimeMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    if (currentTimeMinutes < openTimeMinutes) {
      // Opens later today
      nextOpen.setHours(Math.floor(openTimeMinutes / 60), openTimeMinutes % 60, 0, 0);
    } else {
      // Opens tomorrow
      nextOpen.setDate(nextOpen.getDate() + 1);
      nextOpen.setHours(Math.floor(openTimeMinutes / 60), openTimeMinutes % 60, 0, 0);
    }
    
    return nextOpen;
  }

  private getNextCloseTime(currentTime: Date, closeTimeMinutes: number, currentDayOfWeek: number): Date {
    const nextClose = new Date(currentTime);
    nextClose.setHours(Math.floor(closeTimeMinutes / 60), closeTimeMinutes % 60, 0, 0);
    
    if (nextClose <= currentTime) {
      nextClose.setDate(nextClose.getDate() + 1);
    }
    
    return nextClose;
  }
}
