import { createContext, useContext, useState, type ReactNode } from 'react'
import { setFormatLocale } from './format'

/** SRS section 7: Kazakh and Russian first, English as an additional locale. */
export type Locale = 'en' | 'ru' | 'kk'

export const locales: { code: Locale; label: string; format: string }[] = [
  { code: 'kk', label: 'Қазақша', format: 'kk-KZ' },
  { code: 'ru', label: 'Русский', format: 'ru-RU' },
  { code: 'en', label: 'English', format: 'en-GB' },
]

const en = {
  'nav.explore': 'Explore',
  'nav.tickets': 'My tickets',
  'nav.dashboard': 'Dashboard',
  'nav.create': 'Create event',
  'nav.profile': 'Organizer profile',
  'nav.checkin': 'Check-in',
  'nav.admin': 'Admin',
  'nav.support': 'Support',
  'nav.notifications': 'Notifications',
  'nav.account': 'Account',
  'nav.signIn': 'Sign in',
  'nav.signOut': 'Sign out',
  'nav.register': 'Create account',
  'nav.language': 'Language',
  'nav.unverified': 'Your email is not verified.',
  'nav.verifyNow': 'Verify it now',

  'event.all': '← All events',
  'event.live': 'Live event',
  'event.when': 'Date and time',
  'event.venue': 'Venue',
  'event.opens': 'Registration opens',
  'event.closes': 'Registration closes',
  'event.about': 'About this event',
  'event.refundPolicy': 'Refund policy',
  'event.cancelled': 'This event has been cancelled.',
  'event.calendar': 'Add to calendar',
  'event.ics': 'Download .ics',
  'event.help': 'Ask the organizer',
  'event.report': 'Report this event',
  'event.reportReason': 'Reason',
  'event.reportDetails': 'Details (optional)',
  'event.reportSend': 'Send report',
  'event.reportSent': 'Thank you. The report was sent to the platform team.',
  'event.makeItYours': 'Make it yours',
  'event.chooseTickets': 'Choose tickets',
  'event.chooseSeats': 'Choose seats',
  'event.seatsHint': 'Seats are held for {minutes} minutes once you reserve them.',
  'event.seatsSelected': 'Selected seats',
  'event.noTickets': 'Tickets are not available yet.',
  'event.remaining': '{count} remaining',
  'event.free': 'Free',
  'event.unavailable': 'Currently unavailable',
  'event.promo': 'Promo code',
  'event.optional': 'Optional',
  'event.apply': 'Apply',
  'event.name': 'Attendee name',
  'event.email': 'Email for tickets',
  'event.notActivated': 'Paid ticket sales have not been activated for this event. Contact the organizer.',
  'event.signInHint': 'Sign in to reserve tickets and keep them in your account.',
  'event.subtotal': 'Subtotal',
  'event.discount': 'Discount ({code})',
  'event.total': 'Total',
  'event.totalBefore': 'Total before discounts',
  'event.reserve': 'Reserve tickets',
  'event.reserveFree': 'Reserve free tickets',
  'event.reserving': 'Reserving…',
  'event.simulationNote': 'The following payment step is a simulation; no actual payment will be taken.',
  'event.ready': 'Your tickets are ready!',
  'event.reserved': 'Your tickets are reserved',
  'event.readyText': 'Your booking is confirmed. You can view or download your tickets from your account.',
  'event.reservedText': 'Complete the clearly labelled payment simulation before {time}. No real payment is collected.',
  'event.demoOnly': 'Demo only: these buttons simulate a payment outcome. Do not enter real card details.',
  'event.paySuccess': 'Simulate successful payment',
  'event.payFail': 'Simulate failed payment',
  'event.processing': 'Processing…',
  'event.goToTickets': 'Go to my tickets',
  'event.fee': 'Processing fee',

  'orders.kicker': 'Your plans',
  'orders.title': 'My tickets & orders',
  'orders.subtitle': 'Manage reservations, download printable tickets, and add events to your calendar.',
  'orders.emptyTitle': 'No tickets just yet',
  'orders.emptyText': 'When you reserve a spot, the order and tickets will show up here.',
  'orders.explore': 'Explore events',
  'orders.order': 'Order',
  'orders.pdf': 'PDF ticket',
  'orders.qr': 'QR image',
  'orders.calendar': 'Add to calendar (.ics)',
  'orders.cancel': 'Cancel reservation',
  'orders.help': 'Need help with this order?',
  'orders.refunded': 'Refunded {amount} (simulation)',
  'orders.seat': 'Section {section}, row {row}, seat {seat}',
  'orders.loading': 'Loading your tickets…',
} as const

export type MessageKey = keyof typeof en

const ru: Record<MessageKey, string> = {
  'nav.explore': 'События',
  'nav.tickets': 'Мои билеты',
  'nav.dashboard': 'Панель',
  'nav.create': 'Создать событие',
  'nav.profile': 'Профиль организатора',
  'nav.checkin': 'Контроль входа',
  'nav.admin': 'Админ',
  'nav.support': 'Поддержка',
  'nav.notifications': 'Уведомления',
  'nav.account': 'Аккаунт',
  'nav.signIn': 'Войти',
  'nav.signOut': 'Выйти',
  'nav.register': 'Регистрация',
  'nav.language': 'Язык',
  'nav.unverified': 'Ваш email не подтверждён.',
  'nav.verifyNow': 'Подтвердить',

  'event.all': '← Все события',
  'event.live': 'Событие',
  'event.when': 'Дата и время',
  'event.venue': 'Место проведения',
  'event.opens': 'Регистрация открывается',
  'event.closes': 'Регистрация закрывается',
  'event.about': 'О событии',
  'event.refundPolicy': 'Условия возврата',
  'event.cancelled': 'Это событие отменено.',
  'event.calendar': 'Добавить в календарь',
  'event.ics': 'Скачать .ics',
  'event.help': 'Написать организатору',
  'event.report': 'Пожаловаться на событие',
  'event.reportReason': 'Причина',
  'event.reportDetails': 'Подробности (необязательно)',
  'event.reportSend': 'Отправить жалобу',
  'event.reportSent': 'Спасибо. Жалоба отправлена команде платформы.',
  'event.makeItYours': 'Ваше место',
  'event.chooseTickets': 'Выберите билеты',
  'event.chooseSeats': 'Выберите места',
  'event.seatsHint': 'После бронирования места удерживаются {minutes} минут.',
  'event.seatsSelected': 'Выбранные места',
  'event.noTickets': 'Билеты пока недоступны.',
  'event.remaining': 'Осталось: {count}',
  'event.free': 'Бесплатно',
  'event.unavailable': 'Сейчас недоступно',
  'event.promo': 'Промокод',
  'event.optional': 'Необязательно',
  'event.apply': 'Применить',
  'event.name': 'Имя участника',
  'event.email': 'Email для билетов',
  'event.notActivated': 'Платные продажи для этого события не активированы. Свяжитесь с организатором.',
  'event.signInHint': 'Войдите, чтобы забронировать билеты и сохранить их в аккаунте.',
  'event.subtotal': 'Сумма',
  'event.discount': 'Скидка ({code})',
  'event.total': 'Итого',
  'event.totalBefore': 'Итого без скидок',
  'event.reserve': 'Забронировать билеты',
  'event.reserveFree': 'Получить бесплатные билеты',
  'event.reserving': 'Бронируем…',
  'event.simulationNote': 'Следующий шаг оплаты — симуляция; реальные деньги не списываются.',
  'event.ready': 'Ваши билеты готовы!',
  'event.reserved': 'Билеты забронированы',
  'event.readyText': 'Бронирование подтверждено. Билеты доступны в вашем аккаунте.',
  'event.reservedText': 'Завершите симуляцию оплаты до {time}. Реальная оплата не взимается.',
  'event.demoOnly': 'Только демо: эти кнопки имитируют результат оплаты. Не вводите данные настоящей карты.',
  'event.paySuccess': 'Симулировать успешную оплату',
  'event.payFail': 'Симулировать ошибку оплаты',
  'event.processing': 'Обработка…',
  'event.goToTickets': 'К моим билетам',
  'event.fee': 'Комиссия за обработку',

  'orders.kicker': 'Ваши планы',
  'orders.title': 'Мои билеты и заказы',
  'orders.subtitle': 'Управляйте бронированиями, скачивайте билеты для печати и добавляйте события в календарь.',
  'orders.emptyTitle': 'Билетов пока нет',
  'orders.emptyText': 'Когда вы забронируете место, заказ и билеты появятся здесь.',
  'orders.explore': 'Смотреть события',
  'orders.order': 'Заказ',
  'orders.pdf': 'Билет PDF',
  'orders.qr': 'QR-код',
  'orders.calendar': 'В календарь (.ics)',
  'orders.cancel': 'Отменить бронь',
  'orders.help': 'Нужна помощь с заказом?',
  'orders.refunded': 'Возвращено {amount} (симуляция)',
  'orders.seat': 'Сектор {section}, ряд {row}, место {seat}',
  'orders.loading': 'Загружаем ваши билеты…',
}

const kk: Record<MessageKey, string> = {
  'nav.explore': 'Іс-шаралар',
  'nav.tickets': 'Билеттерім',
  'nav.dashboard': 'Басқару тақтасы',
  'nav.create': 'Іс-шара құру',
  'nav.profile': 'Ұйымдастырушы профилі',
  'nav.checkin': 'Кіруді тексеру',
  'nav.admin': 'Әкімші',
  'nav.support': 'Қолдау',
  'nav.notifications': 'Хабарландырулар',
  'nav.account': 'Аккаунт',
  'nav.signIn': 'Кіру',
  'nav.signOut': 'Шығу',
  'nav.register': 'Тіркелу',
  'nav.language': 'Тіл',
  'nav.unverified': 'Email мекенжайыңыз расталмаған.',
  'nav.verifyNow': 'Растау',

  'event.all': '← Барлық іс-шаралар',
  'event.live': 'Іс-шара',
  'event.when': 'Күні мен уақыты',
  'event.venue': 'Өтетін орны',
  'event.opens': 'Тіркеу ашылады',
  'event.closes': 'Тіркеу жабылады',
  'event.about': 'Іс-шара туралы',
  'event.refundPolicy': 'Қайтару шарттары',
  'event.cancelled': 'Бұл іс-шара тоқтатылды.',
  'event.calendar': 'Күнтізбеге қосу',
  'event.ics': '.ics жүктеу',
  'event.help': 'Ұйымдастырушыға жазу',
  'event.report': 'Іс-шараға шағымдану',
  'event.reportReason': 'Себебі',
  'event.reportDetails': 'Толығырақ (міндетті емес)',
  'event.reportSend': 'Шағым жіберу',
  'event.reportSent': 'Рақмет. Шағым платформа командасына жіберілді.',
  'event.makeItYours': 'Сіздің орныңыз',
  'event.chooseTickets': 'Билет таңдаңыз',
  'event.chooseSeats': 'Орын таңдаңыз',
  'event.seatsHint': 'Брондағаннан кейін орындар {minutes} минут сақталады.',
  'event.seatsSelected': 'Таңдалған орындар',
  'event.noTickets': 'Билеттер әзірге қолжетімсіз.',
  'event.remaining': 'Қалғаны: {count}',
  'event.free': 'Тегін',
  'event.unavailable': 'Қазір қолжетімсіз',
  'event.promo': 'Промокод',
  'event.optional': 'Міндетті емес',
  'event.apply': 'Қолдану',
  'event.name': 'Қатысушының аты',
  'event.email': 'Билет жіберілетін email',
  'event.notActivated': 'Бұл іс-шара үшін ақылы сату іске қосылмаған. Ұйымдастырушыға хабарласыңыз.',
  'event.signInHint': 'Билет брондау және оны аккаунтта сақтау үшін кіріңіз.',
  'event.subtotal': 'Сома',
  'event.discount': 'Жеңілдік ({code})',
  'event.total': 'Барлығы',
  'event.totalBefore': 'Жеңілдіксіз барлығы',
  'event.reserve': 'Билет брондау',
  'event.reserveFree': 'Тегін билет алу',
  'event.reserving': 'Брондалуда…',
  'event.simulationNote': 'Келесі төлем қадамы — симуляция; нақты ақша алынбайды.',
  'event.ready': 'Билеттеріңіз дайын!',
  'event.reserved': 'Билеттер брондалды',
  'event.readyText': 'Брондау расталды. Билеттер аккаунтыңызда қолжетімді.',
  'event.reservedText': 'Төлем симуляциясын {time} дейін аяқтаңыз. Нақты төлем алынбайды.',
  'event.demoOnly': 'Тек демо: бұл батырмалар төлем нәтижесін имитациялайды. Нақты карта деректерін енгізбеңіз.',
  'event.paySuccess': 'Сәтті төлемді имитациялау',
  'event.payFail': 'Сәтсіз төлемді имитациялау',
  'event.processing': 'Өңделуде…',
  'event.goToTickets': 'Билеттеріме өту',
  'event.fee': 'Өңдеу комиссиясы',

  'orders.kicker': 'Жоспарларыңыз',
  'orders.title': 'Билеттерім мен тапсырыстарым',
  'orders.subtitle': 'Брондарды басқарыңыз, басып шығаруға арналған билеттерді жүктеңіз және іс-шараларды күнтізбеге қосыңыз.',
  'orders.emptyTitle': 'Әзірге билет жоқ',
  'orders.emptyText': 'Орын брондағанда тапсырыс пен билеттер осында пайда болады.',
  'orders.explore': 'Іс-шараларды қарау',
  'orders.order': 'Тапсырыс',
  'orders.pdf': 'PDF билет',
  'orders.qr': 'QR сурет',
  'orders.calendar': 'Күнтізбеге (.ics)',
  'orders.cancel': 'Бронды болдырмау',
  'orders.help': 'Тапсырыс бойынша көмек керек пе?',
  'orders.refunded': '{amount} қайтарылды (симуляция)',
  'orders.seat': 'Сектор {section}, қатар {row}, орын {seat}',
  'orders.loading': 'Билеттеріңіз жүктелуде…',
}

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, ru, kk }
const STORAGE_KEY = 'biletflow.locale'

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: Translate }

function translate(locale: Locale, key: MessageKey, values?: Record<string, string | number>) {
  const template = dictionaries[locale][key] ?? en[key]
  return values ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? '')) : template
}

function storedLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  return locales.some((item) => item.code === stored) ? (stored as Locale) : 'en'
}

function applyLocale(locale: Locale) {
  setFormatLocale(locales.find((item) => item.code === locale)!.format)
  document.documentElement.lang = locale
}

// Pages rendered without a provider (unit tests) fall back to English.
const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => undefined,
  t: (key, values) => translate('en', key, values),
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = storedLocale()
    applyLocale(initial)
    return initial
  })

  function setLocale(next: Locale) {
    localStorage.setItem(STORAGE_KEY, next)
    applyLocale(next)
    setLocaleState(next)
  }

  const t: Translate = (key, values) => translate(locale, key, values)
  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
