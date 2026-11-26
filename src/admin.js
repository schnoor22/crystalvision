/**
 * First Light Window Cleaning — Admin page entry
 * Loads the admin styles. The admin logic lives inline in admin/index.html.
 */

import './admin.css';

// The holiday list and calendar are shared with the public site. The inline
// admin script reads them from here when the Holidays tab opens.
import { THEMES, upcomingSchedule, themeForDate, isValidMode } from './js/holiday-themes.js';

window.FLHolidays = { THEMES, upcomingSchedule, themeForDate, isValidMode };
