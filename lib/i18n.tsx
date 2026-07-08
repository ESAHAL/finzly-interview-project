'use client'

/**
 * Lightweight client-side i18n (internationalization = multi-language support)
 * for the site UI. The user's choice is stored in localStorage so it survives
 * page reloads — this is a UI preference, not application data.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export const UI_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
] as const

export type Locale = (typeof UI_LOCALES)[number]['code']

const STORAGE_KEY = 'ui-locale'

type Dict = Record<string, string>

const en: Dict = {
  tagline: 'AI Document Analysis',
  heroTitle: 'Understand any PDF in seconds',
  heroDesc:
    'Paste a PDF link or drag and drop a file. Google Gemini analyses the document server-side into a structured breakdown — type, title, authors, summary, and key takeaway. Go further with Deep Analyse for topics, tone, and audience in your preferred language, then ask follow-up questions grounded in the PDF itself.',
  footer: 'Next.js · AI SDK · Google Gemini · Deployed on Vercel',
  fromUrl: 'From URL',
  uploadFile: 'Upload file',
  pdfUrl: 'PDF URL',
  analyse: 'Analyse',
  analysing: 'Analysing…',
  deepAnalyse: 'Deep Analyse',
  runDeepAnalyse: 'Run Deep Analyse',
  trySample: 'Try the sample:',
  dragDrop: 'Drag & drop a PDF here',
  analysingPdf: 'Analysing your PDF…',
  maxSize: 'Max 25 MB · PDF only',
  browseFiles: 'Browse files',
  chooseFileDeep: 'Choose file for Deep Analyse',
  deepOptions: 'Deep Analyse options',
  cancel: 'Cancel',
  outputLanguage: 'Output language',
  summaryLength: 'Summary length',
  keyTakeawayOpt: 'Key takeaway',
  brief: 'Brief (1-2 sentences)',
  standard: 'Standard (2-3 sentences)',
  detailed: 'Detailed (5-7 sentences)',
  oneSentence: '1 sentence',
  twoSentences: '2 sentences',
  threeSentences: '3 sentences',
  loadingNote: 'Processing the PDF and running the AI analysis. This can take up to a minute for large documents.',
  analysisFailed: 'Analysis failed',
  deepAnalysis: 'Deep analysis',
  analysisResult: 'Analysis result',
  copyJson: 'Copy JSON',
  copied: 'Copied!',
  documentType: 'Document Type',
  titleLabel: 'Title',
  authors: 'Authors',
  summary: 'Summary',
  keyTakeaway: 'Key Takeaway',
  keyTopics: 'Key Topics',
  tone: 'Tone',
  audience: 'Audience',
  askThisPdf: 'Ask this PDF',
  askDesc: 'Ask a question about the analysed document. Answers are grounded in the PDF whenever possible.',
  askPlaceholder: 'e.g. What methodology does this document use?',
  searchingPdf: 'Searching PDF…',
  ask: 'Ask',
  answerFromPdf: 'Answer · from the PDF',
  warningNotFound: 'Warning · not found in the PDF',
  notFoundDesc:
    'This information is not present in the PDF. The answer below is general knowledge from the AI model, not from your document.',
  recentAnalyses: 'Recent analyses (this session)',
  errorOnlyPdf: 'Only PDF files are supported. Please choose a .pdf file.',
  errorTooLarge: 'This PDF is too large (limit is 25 MB).',
  genericError: 'Something went wrong. Please try again.',
}

const hi: Dict = {
  tagline: 'एआई दस्तावेज़ विश्लेषण',
  heroTitle: 'किसी भी PDF को सेकंडों में समझें',
  heroDesc:
    'PDF लिंक पेस्ट करें या फ़ाइल खींचकर छोड़ें। Google Gemini सर्वर पर दस्तावेज़ का संरचित विश्लेषण करता है — प्रकार, शीर्षक, लेखक, सारांश और मुख्य निष्कर्ष। गहन विश्लेषण से विषय, लहजा और लक्षित पाठक अपनी पसंदीदा भाषा में पाएँ, फिर PDF पर आधारित प्रश्न भी पूछें।',
  footer: 'Next.js · AI SDK · Google Gemini · Vercel पर डिप्लॉय',
  fromUrl: 'URL से',
  uploadFile: 'फ़ाइल अपलोड करें',
  pdfUrl: 'PDF URL',
  analyse: 'विश्लेषण करें',
  analysing: 'विश्लेषण हो रहा है…',
  deepAnalyse: 'गहन विश्लेषण',
  runDeepAnalyse: 'गहन विश्लेषण चलाएँ',
  trySample: 'नमूना आज़माएँ:',
  dragDrop: 'PDF यहाँ खींचें और छोड़ें',
  analysingPdf: 'आपकी PDF का विश्लेषण हो रहा है…',
  maxSize: 'अधिकतम 25 MB · केवल PDF',
  browseFiles: 'फ़ाइलें ब्राउज़ करें',
  chooseFileDeep: 'गहन विश्लेषण के लिए फ़ाइल चुनें',
  deepOptions: 'गहन विश्लेषण विकल्प',
  cancel: 'रद्द करें',
  outputLanguage: 'आउटपुट भाषा',
  summaryLength: 'सारांश की लंबाई',
  keyTakeawayOpt: 'मुख्य निष्कर्ष',
  brief: 'संक्षिप्त (1-2 वाक्य)',
  standard: 'मानक (2-3 वाक्य)',
  detailed: 'विस्तृत (5-7 वाक्य)',
  oneSentence: '1 वाक्य',
  twoSentences: '2 वाक्य',
  threeSentences: '3 वाक्य',
  loadingNote: 'PDF संसाधित हो रही है और एआई विश्लेषण चल रहा है। बड़े दस्तावेज़ों में एक मिनट तक लग सकता है।',
  analysisFailed: 'विश्लेषण विफल',
  deepAnalysis: 'गहन विश्लेषण',
  analysisResult: 'विश्लेषण परिणाम',
  copyJson: 'JSON कॉपी करें',
  copied: 'कॉपी हो गया!',
  documentType: 'दस्तावेज़ प्रकार',
  titleLabel: 'शीर्षक',
  authors: 'लेखक',
  summary: 'सारांश',
  keyTakeaway: 'मुख्य निष्कर्ष',
  keyTopics: 'मुख्य विषय',
  tone: 'लहजा',
  audience: 'लक्षित पाठक',
  askThisPdf: 'इस PDF से पूछें',
  askDesc: 'विश्लेषित दस्तावेज़ के बारे में प्रश्न पूछें। उत्तर यथासंभव PDF पर आधारित होते हैं।',
  askPlaceholder: 'जैसे: यह दस्तावेज़ कौन सी पद्धति उपयोग करता है?',
  searchingPdf: 'PDF में खोज हो रही है…',
  ask: 'पूछें',
  answerFromPdf: 'उत्तर · PDF से',
  warningNotFound: 'चेतावनी · PDF में नहीं मिला',
  notFoundDesc:
    'यह जानकारी PDF में मौजूद नहीं है। नीचे दिया गया उत्तर एआई मॉडल का सामान्य ज्ञान है, आपके दस्तावेज़ से नहीं।',
  recentAnalyses: 'हाल के विश्लेषण (इस सत्र में)',
  errorOnlyPdf: 'केवल PDF फ़ाइलें समर्थित हैं। कृपया .pdf फ़ाइल चुनें।',
  errorTooLarge: 'यह PDF बहुत बड़ी है (सीमा 25 MB है)।',
  genericError: 'कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
}

const es: Dict = {
  tagline: 'Análisis de documentos con IA',
  heroTitle: 'Comprende cualquier PDF en segundos',
  heroDesc:
    'Pega un enlace PDF o arrastra y suelta un archivo. Google Gemini analiza el documento en el servidor y devuelve un desglose estructurado: tipo, título, autores, resumen y conclusión clave. Con el análisis profundo obtienes temas, tono y audiencia en tu idioma preferido, y puedes hacer preguntas basadas en el propio PDF.',
  footer: 'Next.js · AI SDK · Google Gemini · Desplegado en Vercel',
  fromUrl: 'Desde URL',
  uploadFile: 'Subir archivo',
  pdfUrl: 'URL del PDF',
  analyse: 'Analizar',
  analysing: 'Analizando…',
  deepAnalyse: 'Análisis profundo',
  runDeepAnalyse: 'Ejecutar análisis profundo',
  trySample: 'Prueba el ejemplo:',
  dragDrop: 'Arrastra y suelta un PDF aquí',
  analysingPdf: 'Analizando tu PDF…',
  maxSize: 'Máx. 25 MB · solo PDF',
  browseFiles: 'Explorar archivos',
  chooseFileDeep: 'Elegir archivo para análisis profundo',
  deepOptions: 'Opciones de análisis profundo',
  cancel: 'Cancelar',
  outputLanguage: 'Idioma de salida',
  summaryLength: 'Longitud del resumen',
  keyTakeawayOpt: 'Conclusión clave',
  brief: 'Breve (1-2 frases)',
  standard: 'Estándar (2-3 frases)',
  detailed: 'Detallado (5-7 frases)',
  oneSentence: '1 frase',
  twoSentences: '2 frases',
  threeSentences: '3 frases',
  loadingNote: 'Procesando el PDF y ejecutando el análisis de IA. Puede tardar hasta un minuto en documentos grandes.',
  analysisFailed: 'Análisis fallido',
  deepAnalysis: 'Análisis profundo',
  analysisResult: 'Resultado del análisis',
  copyJson: 'Copiar JSON',
  copied: '¡Copiado!',
  documentType: 'Tipo de documento',
  titleLabel: 'Título',
  authors: 'Autores',
  summary: 'Resumen',
  keyTakeaway: 'Conclusión clave',
  keyTopics: 'Temas clave',
  tone: 'Tono',
  audience: 'Audiencia',
  askThisPdf: 'Pregunta a este PDF',
  askDesc: 'Haz una pregunta sobre el documento analizado. Las respuestas se basan en el PDF siempre que sea posible.',
  askPlaceholder: 'p. ej. ¿Qué metodología usa este documento?',
  searchingPdf: 'Buscando en el PDF…',
  ask: 'Preguntar',
  answerFromPdf: 'Respuesta · del PDF',
  warningNotFound: 'Aviso · no encontrado en el PDF',
  notFoundDesc:
    'Esta información no está en el PDF. La respuesta siguiente es conocimiento general del modelo de IA, no de tu documento.',
  recentAnalyses: 'Análisis recientes (esta sesión)',
  errorOnlyPdf: 'Solo se admiten archivos PDF. Elige un archivo .pdf.',
  errorTooLarge: 'Este PDF es demasiado grande (límite de 25 MB).',
  genericError: 'Algo salió mal. Inténtalo de nuevo.',
}

const fr: Dict = {
  tagline: 'Analyse de documents par IA',
  heroTitle: "Comprenez n'importe quel PDF en quelques secondes",
  heroDesc:
    "Collez un lien PDF ou glissez-déposez un fichier. Google Gemini analyse le document côté serveur et renvoie une synthèse structurée : type, titre, auteurs, résumé et conclusion clé. L'analyse approfondie ajoute les sujets, le ton et le public visé dans la langue de votre choix, et vous pouvez poser des questions fondées sur le PDF.",
  footer: 'Next.js · AI SDK · Google Gemini · Déployé sur Vercel',
  fromUrl: 'Depuis une URL',
  uploadFile: 'Téléverser un fichier',
  pdfUrl: 'URL du PDF',
  analyse: 'Analyser',
  analysing: 'Analyse en cours…',
  deepAnalyse: 'Analyse approfondie',
  runDeepAnalyse: "Lancer l'analyse approfondie",
  trySample: "Essayez l'exemple :",
  dragDrop: 'Glissez-déposez un PDF ici',
  analysingPdf: 'Analyse de votre PDF…',
  maxSize: 'Max 25 Mo · PDF uniquement',
  browseFiles: 'Parcourir les fichiers',
  chooseFileDeep: "Choisir un fichier pour l'analyse approfondie",
  deepOptions: "Options d'analyse approfondie",
  cancel: 'Annuler',
  outputLanguage: 'Langue de sortie',
  summaryLength: 'Longueur du résumé',
  keyTakeawayOpt: 'Conclusion clé',
  brief: 'Bref (1-2 phrases)',
  standard: 'Standard (2-3 phrases)',
  detailed: 'Détaillé (5-7 phrases)',
  oneSentence: '1 phrase',
  twoSentences: '2 phrases',
  threeSentences: '3 phrases',
  loadingNote:
    "Traitement du PDF et exécution de l'analyse IA. Cela peut prendre jusqu'à une minute pour les gros documents.",
  analysisFailed: "Échec de l'analyse",
  deepAnalysis: 'Analyse approfondie',
  analysisResult: "Résultat de l'analyse",
  copyJson: 'Copier le JSON',
  copied: 'Copié !',
  documentType: 'Type de document',
  titleLabel: 'Titre',
  authors: 'Auteurs',
  summary: 'Résumé',
  keyTakeaway: 'Conclusion clé',
  keyTopics: 'Sujets clés',
  tone: 'Ton',
  audience: 'Public visé',
  askThisPdf: 'Interroger ce PDF',
  askDesc: 'Posez une question sur le document analysé. Les réponses sont fondées sur le PDF autant que possible.',
  askPlaceholder: 'ex. Quelle méthodologie ce document utilise-t-il ?',
  searchingPdf: 'Recherche dans le PDF…',
  ask: 'Demander',
  answerFromPdf: 'Réponse · issue du PDF',
  warningNotFound: 'Avertissement · introuvable dans le PDF',
  notFoundDesc:
    "Cette information n'est pas présente dans le PDF. La réponse ci-dessous est une connaissance générale du modèle d'IA, pas de votre document.",
  recentAnalyses: 'Analyses récentes (cette session)',
  errorOnlyPdf: 'Seuls les fichiers PDF sont pris en charge. Choisissez un fichier .pdf.',
  errorTooLarge: 'Ce PDF est trop volumineux (limite de 25 Mo).',
  genericError: "Une erreur s'est produite. Veuillez réessayer.",
}

const DICTIONARIES: Record<Locale, Dict> = { en, hi, es, fr }

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  // Restore the saved preference on first mount (client only).
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved && DICTIONARIES[saved as Locale]) {
      setLocaleState(saved as Locale)
      document.documentElement.lang = saved
    }
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    // Keep the <html lang> attribute in sync for screen readers and SEO.
    document.documentElement.lang = next
  }, [])

  const t = useCallback(
    (key: string) => DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key,
    [locale],
  )

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
