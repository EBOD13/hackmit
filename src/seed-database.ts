import { QuestDatabase } from './database';

const sampleQuestTemplates = [
  {
    title: 'Coffee Explorer',
    description: 'Find and visit a local coffee shop. Order any drink and enjoy the local atmosphere!',
    category: 'food',
    points: 100,
    location_name: 'Downtown Coffee House',
    location_address: '123 Main Street',
    location_lat: 42.3601,
    location_lng: -71.0589
  },
  {
    title: 'Park Walker',
    description: 'Take a walk through the nearest park. Find a bench and sit for 2 minutes to appreciate nature.',
    category: 'exercise',
    points: 75,
    location_name: 'City Central Park',
    location_address: '456 Park Avenue',
    location_lat: 42.3611,
    location_lng: -71.0570
  },
  {
    title: 'Local History',
    description: 'Visit the town library and find one interesting historical fact about your city.',
    category: 'culture',
    points: 150,
    location_name: 'Public Library',
    location_address: '789 Library Lane',
    location_lat: 42.3591,
    location_lng: -71.0599
  },
  {
    title: 'Bookstore Browser',
    description: 'Visit a local bookstore and find a book you have never read before. Browse for at least 5 minutes.',
    category: 'culture',
    points: 120,
    location_name: 'Corner Bookshop',
    location_address: '321 Reading Road',
    location_lat: 42.3581,
    location_lng: -71.0609
  },
  {
    title: 'Fresh Market',
    description: 'Visit a farmers market or grocery store. Buy one piece of fresh fruit or vegetable.',
    category: 'food',
    points: 90,
    location_name: 'Weekend Farmers Market',
    location_address: 'Town Square, Market Street',
    location_lat: 42.3621,
    location_lng: -71.0560
  },
  {
    title: 'Street Art Hunter',
    description: 'Find and photograph an interesting piece of street art or mural in your area.',
    category: 'exploration',
    points: 110,
    location_name: 'Arts District',
    location_address: 'Creative Avenue',
    location_lat: 42.3571,
    location_lng: -71.0619
  },
  {
    title: 'Local Eatery',
    description: 'Try a restaurant you have never been to before. Order something new!',
    category: 'food',
    points: 130,
    location_name: 'Neighborhood Bistro',
    location_address: '555 Flavor Street',
    location_lat: 42.3631,
    location_lng: -71.0550
  },
  {
    title: 'Exercise Quest',
    description: 'Find a local gym, fitness center, or outdoor exercise area. Do 10 minutes of physical activity.',
    category: 'exercise',
    points: 100,
    location_name: 'Community Fitness Center',
    location_address: '777 Health Way',
    location_lat: 42.3561,
    location_lng: -71.0629
  }
];

export async function seedDatabase() {
  const db = new QuestDatabase();

  try {
    console.log('Initializing database...');
    await db.initialize();

    console.log('Seeding quest templates...');
    for (const template of sampleQuestTemplates) {
      await db.createQuestTemplate(template);
      console.log(`✅ Added quest: ${template.title}`);
    }

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await db.close();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase().catch(console.error);
}