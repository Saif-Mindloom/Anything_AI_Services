/**
 * Indian Holidays and Occasions Service
 * Provides information about Indian festivals, holidays, and special occasions
 */

interface Holiday {
  name: string;
  date: string;
  description: string;
  type: "religious" | "national" | "cultural";
  religion?: "hindu" | "muslim" | "christian" | "sikh" | "all";
}

interface OccasionInfo {
  currentWeekHolidays: Holiday[];
  upcomingHolidays: Holiday[];
  todayOccasion?: Holiday;
}

export class OccasionsService {
  // Indian holidays for 2026 (approximate dates, some festivals follow lunar calendar)
  private holidays2026: Holiday[] = [
    {
      name: "New Year's Day",
      date: "2026-01-01",
      description: "The first day of the Gregorian calendar year",
      type: "cultural",
      religion: "all",
    },
    {
      name: "Makar Sankranti",
      date: "2026-01-14",
      description:
        "Hindu festival celebrating the sun's transit into Makara (Capricorn)",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Republic Day",
      date: "2026-01-26",
      description: "Commemorates the adoption of the Constitution of India",
      type: "national",
      religion: "all",
    },
    {
      name: "Maha Shivaratri",
      date: "2026-02-17",
      description: "Hindu festival celebrating Lord Shiva",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Holi",
      date: "2026-03-17",
      description: "Hindu festival of colors celebrating the arrival of spring",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Eid ul-Fitr",
      date: "2026-03-31",
      description: "Islamic festival marking the end of Ramadan",
      type: "religious",
      religion: "muslim",
    },
    {
      name: "Ram Navami",
      date: "2026-04-02",
      description: "Hindu festival celebrating the birth of Lord Rama",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Good Friday",
      date: "2026-04-03",
      description:
        "Christian observance commemorating the crucifixion of Jesus",
      type: "religious",
      religion: "christian",
    },
    {
      name: "Easter Sunday",
      date: "2026-04-05",
      description: "Christian festival celebrating the resurrection of Jesus",
      type: "religious",
      religion: "christian",
    },
    {
      name: "Ambedkar Jayanti",
      date: "2026-04-14",
      description:
        "Birthday of Dr. B.R. Ambedkar, architect of the Indian Constitution",
      type: "national",
      religion: "all",
    },
    {
      name: "Eid ul-Adha",
      date: "2026-06-17",
      description: "Islamic festival of sacrifice",
      type: "religious",
      religion: "muslim",
    },
    {
      name: "Muharram",
      date: "2026-07-07",
      description: "Islamic New Year and day of remembrance",
      type: "religious",
      religion: "muslim",
    },
    {
      name: "Independence Day",
      date: "2026-08-15",
      description: "Commemorates India's independence from British rule",
      type: "national",
      religion: "all",
    },
    {
      name: "Janmashtami",
      date: "2026-08-24",
      description: "Hindu festival celebrating the birth of Lord Krishna",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Ganesh Chaturthi",
      date: "2026-09-13",
      description: "Hindu festival celebrating Lord Ganesha",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Gandhi Jayanti",
      date: "2026-10-02",
      description: "Birthday of Mahatma Gandhi, father of the nation",
      type: "national",
      religion: "all",
    },
    {
      name: "Dussehra",
      date: "2026-10-12",
      description: "Hindu festival celebrating the victory of good over evil",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Diwali",
      date: "2026-11-01",
      description:
        "Hindu festival of lights celebrating the triumph of light over darkness",
      type: "religious",
      religion: "hindu",
    },
    {
      name: "Guru Nanak Jayanti",
      date: "2026-11-15",
      description: "Birthday of Guru Nanak, founder of Sikhism",
      type: "religious",
      religion: "sikh",
    },
    {
      name: "Christmas",
      date: "2026-12-25",
      description: "Christian festival celebrating the birth of Jesus Christ",
      type: "cultural",
      religion: "christian",
    },
  ];

  /**
   * Get all occasions within a date range
   */
  private getHolidaysInRange(startDate: Date, endDate: Date): Holiday[] {
    return this.holidays2026.filter((holiday) => {
      const holidayDate = new Date(holiday.date);
      return holidayDate >= startDate && holidayDate <= endDate;
    });
  }

  /**
   * Get today's occasion if any
   */
  getTodayOccasion(): Holiday | undefined {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    return this.holidays2026.find((holiday) => holiday.date === todayStr);
  }

  /**
   * Get occasions for the current week
   */
  getCurrentWeekOccasions(): Holiday[] {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday

    return this.getHolidaysInRange(startOfWeek, endOfWeek);
  }

  /**
   * Get upcoming occasions (next 30 days)
   */
  getUpcomingOccasions(days: number = 30): Holiday[] {
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + days);

    return this.holidays2026.filter((holiday) => {
      const holidayDate = new Date(holiday.date);
      return holidayDate > today && holidayDate <= futureDate;
    });
  }

  /**
   * Get comprehensive occasion information
   */
  getOccasionInfo(): OccasionInfo {
    return {
      todayOccasion: this.getTodayOccasion(),
      currentWeekHolidays: this.getCurrentWeekOccasions(),
      upcomingHolidays: this.getUpcomingOccasions(),
    };
  }

  /**
   * Check if a specific date is a holiday
   */
  isHoliday(date: string): Holiday | undefined {
    return this.holidays2026.find((holiday) => holiday.date === date);
  }

  /**
   * Get holidays by religion
   */
  getHolidaysByReligion(
    religion: "hindu" | "muslim" | "christian" | "sikh" | "all"
  ): Holiday[] {
    if (religion === "all") {
      return this.holidays2026.filter((holiday) => holiday.religion === "all");
    }
    return this.holidays2026.filter((holiday) => holiday.religion === religion);
  }

  /**
   * Format occasion information as readable text
   */
  formatOccasionInfo(info: OccasionInfo): string {
    let result = "";

    if (info.todayOccasion) {
      result += `🎉 TODAY'S OCCASION:\n`;
      result += `${info.todayOccasion.name} - ${info.todayOccasion.description}\n\n`;
    }

    if (info.currentWeekHolidays.length > 0) {
      result += `📅 THIS WEEK'S OCCASIONS:\n`;
      info.currentWeekHolidays.forEach((holiday) => {
        result += `• ${holiday.name} (${holiday.date}): ${holiday.description}\n`;
      });
      result += "\n";
    }

    if (info.upcomingHolidays.length > 0) {
      result += `🔮 UPCOMING OCCASIONS (Next 30 Days):\n`;
      info.upcomingHolidays.forEach((holiday) => {
        result += `• ${holiday.name} (${holiday.date}): ${holiday.description}\n`;
      });
    }

    if (
      !info.todayOccasion &&
      info.currentWeekHolidays.length === 0 &&
      info.upcomingHolidays.length === 0
    ) {
      result =
        "No special occasions found for the current week or upcoming month.";
    }

    return result;
  }

  /**
   * Get fashion recommendations based on occasion
   */
  getOccasionFashionAdvice(occasion: Holiday): string {
    const adviceMap: { [key: string]: string } = {
      Diwali:
        "Wear traditional Indian attire like sarees, lehengas, kurtas, or sherwanis in vibrant colors like red, gold, orange, or royal blue.",
      Holi: "Wear comfortable white or light-colored clothes that you don't mind getting colored. Avoid expensive or delicate fabrics.",
      "Eid ul-Fitr":
        "Dress in your finest traditional wear - kurta-pajama, sherwanis for men, or elegant salwar kameez, abayas for women. Pastel colors are popular.",
      "Eid ul-Adha":
        "Similar to Eid ul-Fitr, opt for traditional modest clothing in festive colors.",
      Christmas:
        "Dress festively in red, green, gold, or white. Western formals or smart casuals work well for celebrations.",
      "New Year's Day":
        "Dress up! Sequins, metallics, and party wear are perfect. Make a statement with bold colors or elegant black.",
      Janmashtami:
        "Traditional Indian wear in blue and yellow (colors associated with Lord Krishna) is ideal.",
      "Ganesh Chaturthi":
        "Wear traditional attire in bright colors, especially red, yellow, and orange.",
      Dussehra:
        "Traditional Indian clothes in vibrant colors. Red, green, and yellow are auspicious.",
      "Independence Day":
        "Wear the tricolor - saffron, white, and green. Traditional or Western wear both work.",
      "Republic Day":
        "Similar to Independence Day - incorporate tricolor in your outfit.",
    };

    return (
      adviceMap[occasion.name] ||
      "Dress according to the occasion's cultural significance and your comfort."
    );
  }
}
