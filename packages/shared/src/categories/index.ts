export interface CategoryRef {
  name: string;
  subcategories: string[];
}

export const CATEGORIES: CategoryRef[] = [
  {
    name: "Данные",
    subcategories: ["Обогащение данных", "Проверка и комплаенс"],
  },
  {
    name: "Документы",
    subcategories: ["Распознавание", "Извлечение и структура", "Генерация"],
  },
  {
    name: "Аудио",
    subcategories: ["Расшифровка речи", "Анализ и синтез"],
  },
  {
    name: "Видео",
    subcategories: ["Обработка", "Анализ и распознавание"],
  },
  {
    name: "Изображения",
    subcategories: ["Распознавание", "Генерация", "Обработка"],
  },
  {
    name: "Текст и NLP",
    subcategories: ["Перевод", "Аннотирование", "Классификация", "Саммаризация"],
  },
  {
    name: "Гео",
    subcategories: ["Геокодирование", "Маршрутизация", "Карты"],
  },
  {
    name: "Финансы",
    subcategories: ["Платежи", "Скоринг", "Аналитика"],
  },
  {
    name: "Коммуникации",
    subcategories: ["SMS и Email", "Мессенджеры", "Voice API"],
  },
  {
    name: "Аналитика",
    subcategories: ["Бизнес-аналитика", "Машинное обучение", "Big Data"],
  },
  {
    name: "Безопасность",
    subcategories: ["Аутентификация", "Антифрод", "Контроль доступа"],
  },
  {
    name: "DevTools",
    subcategories: ["CI/CD", "Мониторинг", "Инфраструктура"],
  },
  {
    name: "Маркетинг",
    subcategories: ["SEO", "Email-маркетинг", "Соцсети"],
  },
  {
    name: "E-commerce",
    subcategories: ["Каталог", "Платежи", "Логистика"],
  },
  {
    name: "Образование",
    subcategories: ["Курсы", "Тестирование", "Аналитика обучения"],
  },
  {
    name: "Здоровье",
    subcategories: ["Запись к врачу", "Аналитика", "Телемедицина"],
  },
  {
    name: "Право",
    subcategories: ["Документооборот", "Проверка контрагентов", "Конструкторы"],
  },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

export function findCategory(name: string): CategoryRef | undefined {
  return CATEGORIES.find((c) => c.name === name);
}

export function isValidCategory(name: string): boolean {
  return CATEGORIES.some((c) => c.name === name);
}

export function isValidSubcategory(category: string, subcategory: string): boolean {
  const cat = findCategory(category);
  return cat ? cat.subcategories.includes(subcategory) : false;
}
