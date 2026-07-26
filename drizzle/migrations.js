// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_romantic_polaris.sql';
import m0001 from './0001_old_garia.sql';
import m0002 from './0002_aromatic_sasquatch.sql';
import m0003 from './0003_married_weapon_omega.sql';
import m0004 from './0004_skinny_doctor_octopus.sql';
import m0005 from './0005_gorgeous_smasher.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005
    }
  }
  