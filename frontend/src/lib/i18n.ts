export type Locale = "en" | "de" | "tr";

export type UiCopy = {
  flagLabel: string;
  appSubtitle: string;
  connected: string;
  checking: string;
  noKey: string;
  keyConfigured: string;
  keyMissing: string;
  tabs: {
    activity: string;
    files: string;
    memory: string;
    jobs: string;
  };
  chat: {
    welcome: string;
    intro: string;
    suggestions: string[];
    you: string;
    placeholder: string;
    enterHint: string;
    send: string;
    stop: string;
    voiceStart: string;
    voiceStop: string;
    voiceUnsupported: string;
    voiceLang: string;
    connectionError: string;
    thinking: string;
    stillWaiting: string;
    modelTimeout: string;
  };
  activity: {
    title: string;
    working: string;
    empty: string;
  };
  documents: {
    title: string;
    files: string;
    drop: string;
    working: string;
    uploadHint: string;
    inputs: string;
    outputs: string;
    clear: string;
    clearTitle: string;
    consolidate: string;
    consolidateTitle: string;
    consolidateDone: (count: number) => string;
    newGroup: string;
    createGroup: string;
    moveToGroup: (name: string) => string;
    download: (name: string) => string;
    delete: (name: string) => string;
    deleteConfirm: (name: string) => string;
    clearConfirm: (count: number) => string;
    removeGroup: (name: string) => string;
    removeGroupConfirm: (name: string) => string;
    collapseGroup: (name: string) => string;
    expandGroup: (name: string) => string;
    emptyGroup: string;
    empty: string;
    typeLabel: string;
    statusLabel: string;
    docTypes: Record<string, string>;
    statuses: Record<string, string>;
    quickTitle: string;
    selectFile: string;
    quickActions: {
      translateTr: string;
      translateDe: string;
      translateEn: string;
      summarize: string;
      read: string;
      reconstruct: string;
    };
    runAction: string;
    actionPrompts: {
      translateTr: (name: string) => string;
      translateDe: (name: string) => string;
      translateEn: (name: string) => string;
      summarize: (name: string) => string;
      read: (name: string) => string;
      reconstruct: (name: string) => string;
    };
    groupLabels: {
      Inputs: string;
      Outputs: string;
    };
  };
  memory: {
    title: string;
    memories: string;
    glossary: string;
    emptyMemories: string;
    emptyGlossary: string;
    long: string;
    session: string;
    clearAll: string;
    clearConfirm: string;
    removeOne: string;
  };
  jobs: {
    title: string;
    empty: string;
    running: string;
    done: string;
    error: string;
  };
};

export const LOCALES: { id: Locale; flag: string; label: string }[] = [
  { id: "en", flag: "🇬🇧", label: "English" },
  { id: "de", flag: "🇩🇪", label: "Deutsch" },
  { id: "tr", flag: "🇹🇷", label: "Türkçe" },
];

export const COPY: Record<Locale, UiCopy> = {
  en: {
    flagLabel: "Language",
    appSubtitle: "document agent",
    connected: "connected",
    checking: "checking",
    noKey: "no key",
    keyConfigured: "Fireworks key configured",
    keyMissing: "No Fireworks key",
    tabs: { activity: "Activity", files: "Files", memory: "Memory", jobs: "Jobs" },
    chat: {
      welcome: "Welcome to",
      intro: "Read, compare, revise and translate documents. Watch every step as it happens.",
      suggestions: [
        "What documents do I have?",
        "Translate report.docx into German and French",
        "Compare original.pdf and revised.pdf",
        "Remember that I prefer formal tone",
      ],
      you: "You",
      placeholder: "Ask DocFlow to read, translate, or revise a document...",
      enterHint: "Enter to send, Shift+Enter for a new line.",
      send: "Send",
      stop: "Stop",
      voiceStart: "Start voice transcript",
      voiceStop: "Stop voice transcript",
      voiceUnsupported: "Voice transcript is not supported in this browser.",
      voiceLang: "en-US",
      connectionError: "Connection error.",
      thinking: "Thinking...",
      stillWaiting: "Still waiting for the model. You can stop and retry with a more specific file name.",
      modelTimeout: "The model did not start in time. Try again with the exact file name.",
    },
    activity: {
      title: "Live Activity",
      working: "working",
      empty: "Every tool the agent runs shows up here as it happens.",
    },
    documents: {
      title: "Documents",
      files: "files",
      drop: "Drop files or click",
      working: "Working...",
      uploadHint: "New uploads land in Inputs.",
      inputs: "inputs",
      outputs: "outputs",
      clear: "clear",
      clearTitle: "Delete every file in the document base",
      consolidate: "organize",
      consolidateTitle: "Evaluate and tidy document labels",
      consolidateDone: (count) => `Updated ${count} document labels.`,
      newGroup: "New visible group",
      createGroup: "Create group",
      moveToGroup: (name) => `Move ${name} to group`,
      download: (name) => `Download ${name}`,
      delete: (name) => `Delete ${name}`,
      deleteConfirm: (name) => `Delete ${name}?`,
      clearConfirm: (count) => `Delete all ${count} files from the document base?`,
      removeGroup: (name) => `Remove group ${name}`,
      removeGroupConfirm: (name) =>
        `Remove group ${name}? Files stay in the document base and move to Inputs.`,
      collapseGroup: (name) => `Collapse ${name}`,
      expandGroup: (name) => `Expand ${name}`,
      emptyGroup: "Empty group. Move files here from the menu.",
      empty: "No documents yet.",
      typeLabel: "Type",
      statusLabel: "Status",
      docTypes: {
        unknown: "Unknown",
        letter: "Letter",
        report: "Report",
        certificate: "Certificate",
        invoice: "Invoice",
        contract: "Contract",
        id: "ID",
        insurance: "Insurance",
        tax: "Tax",
        medical: "Medical",
        bank: "Bank",
        scan: "Scan",
        output: "Output",
      },
      statuses: {
        new: "New",
        reviewed: "Reviewed",
        action_needed: "Action needed",
        done: "Done",
        archived: "Archived",
      },
      quickTitle: "Quick Actions",
      selectFile: "Select file",
      quickActions: {
        translateTr: "Translate to Turkish",
        translateDe: "Translate to German",
        translateEn: "Translate to English",
        summarize: "Summarize",
        read: "Read / inspect",
        reconstruct: "PDF to Word",
      },
      runAction: "Run",
      actionPrompts: {
        translateTr: (name) => `Translate ${name} into Turkish and return the real download link.`,
        translateDe: (name) => `Translate ${name} into German and return the real download link.`,
        translateEn: (name) => `Translate ${name} into English and return the real download link.`,
        summarize: (name) => `Read ${name} and summarize the important points clearly.`,
        read: (name) => `Read ${name} and tell me what kind of document it is, with key details.`,
        reconstruct: (name) => `Convert ${name} into a clean formatted Word document and return the download link.`,
      },
      groupLabels: { Inputs: "Inputs", Outputs: "Outputs" },
    },
    memory: {
      title: "Memory & Glossary",
      memories: "Memories",
      glossary: "Glossary",
      emptyMemories: "Nothing saved yet. Ask DocFlow to remember something.",
      emptyGlossary: "No glossary terms.",
      long: "long",
      session: "session",
      clearAll: "Reset all",
      clearConfirm: "Delete all memories? This cannot be undone.",
      removeOne: "Delete memory",
    },
    jobs: { title: "Jobs", empty: "No jobs yet.", running: "running", done: "done", error: "error" },
  },
  de: {
    flagLabel: "Sprache",
    appSubtitle: "Dokumenten-Assistent",
    connected: "verbunden",
    checking: "prüfen",
    noKey: "kein Key",
    keyConfigured: "Fireworks-Key ist eingerichtet",
    keyMissing: "Kein Fireworks-Key",
    tabs: { activity: "Aktivität", files: "Dateien", memory: "Gedächtnis", jobs: "Jobs" },
    chat: {
      welcome: "Willkommen bei",
      intro: "Dokumente lesen, vergleichen, überarbeiten und übersetzen. Jeder Schritt bleibt sichtbar.",
      suggestions: [
        "Welche Dokumente habe ich?",
        "Übersetze report.docx ins Deutsche und Französische",
        "Vergleiche original.pdf und revised.pdf",
        "Merke dir, dass ich einen formellen Ton bevorzuge",
      ],
      you: "Du",
      placeholder: "Bitte DocFlow, ein Dokument zu lesen, zu übersetzen oder zu überarbeiten...",
      enterHint: "Enter zum Senden, Shift+Enter für eine neue Zeile.",
      send: "Senden",
      stop: "Stoppen",
      voiceStart: "Sprachtranskript starten",
      voiceStop: "Sprachtranskript stoppen",
      voiceUnsupported: "Sprachtranskript wird in diesem Browser nicht unterstützt.",
      voiceLang: "de-DE",
      connectionError: "Verbindungsfehler.",
      thinking: "Denke nach...",
      stillWaiting:
        "Das Modell antwortet noch nicht. Du kannst stoppen und es mit einem genaueren Dateinamen erneut versuchen.",
      modelTimeout: "Das Modell hat nicht rechtzeitig gestartet. Versuche es erneut mit dem exakten Dateinamen.",
    },
    activity: {
      title: "Live-Aktivität",
      working: "arbeitet",
      empty: "Alle Werkzeuge, die der Agent nutzt, erscheinen hier live.",
    },
    documents: {
      title: "Dokumente",
      files: "Dateien",
      drop: "Dateien ablegen oder klicken",
      working: "Arbeite...",
      uploadHint: "Neue Uploads landen in Eingaben.",
      inputs: "Eingaben",
      outputs: "Ausgaben",
      clear: "leeren",
      clearTitle: "Alle Dateien aus der Dokumentbasis löschen",
      consolidate: "ordnen",
      consolidateTitle: "Dokumentlabels prüfen und aufräumen",
      consolidateDone: (count) => `${count} Dokumentlabels aktualisiert.`,
      newGroup: "Neue sichtbare Gruppe",
      createGroup: "Gruppe erstellen",
      moveToGroup: (name) => `${name} in Gruppe verschieben`,
      download: (name) => `${name} herunterladen`,
      delete: (name) => `${name} löschen`,
      deleteConfirm: (name) => `${name} löschen?`,
      clearConfirm: (count) => `Alle ${count} Dateien aus der Dokumentbasis löschen?`,
      removeGroup: (name) => `Gruppe ${name} entfernen`,
      removeGroupConfirm: (name) =>
        `Gruppe ${name} entfernen? Dateien bleiben in der Dokumentbasis und werden zu Eingaben verschoben.`,
      collapseGroup: (name) => `${name} einklappen`,
      expandGroup: (name) => `${name} ausklappen`,
      emptyGroup: "Leere Gruppe. Verschiebe Dateien über das Menü hierher.",
      empty: "Noch keine Dokumente.",
      typeLabel: "Typ",
      statusLabel: "Status",
      docTypes: {
        unknown: "Unbekannt",
        letter: "Brief",
        report: "Bericht",
        certificate: "Zertifikat",
        invoice: "Rechnung",
        contract: "Vertrag",
        id: "Ausweis",
        insurance: "Versicherung",
        tax: "Steuer",
        medical: "Medizinisch",
        bank: "Bank",
        scan: "Scan",
        output: "Ausgabe",
      },
      statuses: {
        new: "Neu",
        reviewed: "Geprüft",
        action_needed: "Aktion nötig",
        done: "Erledigt",
        archived: "Archiviert",
      },
      quickTitle: "Schnellaktionen",
      selectFile: "Datei wählen",
      quickActions: {
        translateTr: "Ins Türkische übersetzen",
        translateDe: "Ins Deutsche übersetzen",
        translateEn: "Ins Englische übersetzen",
        summarize: "Zusammenfassen",
        read: "Lesen / prüfen",
        reconstruct: "PDF zu Word",
      },
      runAction: "Starten",
      actionPrompts: {
        translateTr: (name) => `Übersetze ${name} ins Türkische und gib den echten Download-Link zurück.`,
        translateDe: (name) => `Übersetze ${name} ins Deutsche und gib den echten Download-Link zurück.`,
        translateEn: (name) => `Übersetze ${name} ins Englische und gib den echten Download-Link zurück.`,
        summarize: (name) => `Lies ${name} und fasse die wichtigsten Punkte klar zusammen.`,
        read: (name) => `Lies ${name} und sage mir, welche Art Dokument es ist, mit wichtigen Details.`,
        reconstruct: (name) => `Konvertiere ${name} in ein sauber formatiertes Word-Dokument und gib den Download-Link zurück.`,
      },
      groupLabels: { Inputs: "Eingaben", Outputs: "Ausgaben" },
    },
    memory: {
      title: "Gedächtnis & Glossar",
      memories: "Notizen",
      glossary: "Glossar",
      emptyMemories: "Noch nichts gespeichert. Bitte DocFlow, sich etwas zu merken.",
      emptyGlossary: "Keine Glossarbegriffe.",
      long: "lang",
      session: "Sitzung",
      clearAll: "Alle löschen",
      clearConfirm: "Alle Notizen löschen? Das kann nicht rückgängig gemacht werden.",
      removeOne: "Notiz löschen",
    },
    jobs: { title: "Jobs", empty: "Noch keine Jobs.", running: "läuft", done: "fertig", error: "Fehler" },
  },
  tr: {
    flagLabel: "Dil",
    appSubtitle: "belge asistanı",
    connected: "bağlı",
    checking: "kontrol",
    noKey: "anahtar yok",
    keyConfigured: "Fireworks anahtarı ayarlı",
    keyMissing: "Fireworks anahtarı yok",
    tabs: { activity: "Aktivite", files: "Dosyalar", memory: "Hafıza", jobs: "İşler" },
    chat: {
      welcome: "Hoş geldin,",
      intro: "Belgeleri oku, karşılaştır, düzenle ve çevir. Her adımı canlı izle.",
      suggestions: [
        "Hangi belgelerim var?",
        "report.docx dosyasını Almanca ve Fransızcaya çevir",
        "original.pdf ile revised.pdf dosyalarını karşılaştır",
        "Resmi bir ton tercih ettiğimi hatırla",
      ],
      you: "Sen",
      placeholder: "DocFlow'dan bir belgeyi okumasını, çevirmesini veya düzenlemesini iste...",
      enterHint: "Göndermek için Enter, yeni satır için Shift+Enter.",
      send: "Gönder",
      stop: "Durdur",
      voiceStart: "Sesli transcript başlat",
      voiceStop: "Sesli transcript durdur",
      voiceUnsupported: "Bu tarayıcı sesli transcript desteklemiyor.",
      voiceLang: "tr-TR",
      connectionError: "Bağlantı hatası.",
      thinking: "Düşünüyor...",
      stillWaiting:
        "Model hâlâ yanıt bekliyor. Durdurup daha net bir dosya adıyla tekrar deneyebilirsin.",
      modelTimeout: "Model zamanında başlamadı. Tam dosya adıyla tekrar dene.",
    },
    activity: {
      title: "Canlı Aktivite",
      working: "çalışıyor",
      empty: "Ajanın kullandığı her araç burada canlı görünür.",
    },
    documents: {
      title: "Belgeler",
      files: "dosya",
      drop: "Dosya bırak veya tıkla",
      working: "Çalışıyor...",
      uploadHint: "Yeni yüklemeler Girdiler'e eklenir.",
      inputs: "girdiler",
      outputs: "çıktılar",
      clear: "temizle",
      clearTitle: "Belge tabanındaki tüm dosyaları sil",
      consolidate: "düzenle",
      consolidateTitle: "Belge etiketlerini değerlendir ve toparla",
      consolidateDone: (count) => `${count} belge etiketi güncellendi.`,
      newGroup: "Yeni görünür grup",
      createGroup: "Grup oluştur",
      moveToGroup: (name) => `${name} dosyasını gruba taşı`,
      download: (name) => `${name} indir`,
      delete: (name) => `${name} sil`,
      deleteConfirm: (name) => `${name} silinsin mi?`,
      clearConfirm: (count) => `Belge tabanındaki ${count} dosyanın tamamı silinsin mi?`,
      removeGroup: (name) => `${name} grubunu kaldır`,
      removeGroupConfirm: (name) =>
        `${name} grubu kaldırılsın mı? Dosyalar belge tabanında kalır ve Girdiler'e taşınır.`,
      collapseGroup: (name) => `${name} grubunu kapat`,
      expandGroup: (name) => `${name} grubunu aç`,
      emptyGroup: "Boş grup. Dosyaları menüden buraya taşı.",
      empty: "Henüz belge yok.",
      typeLabel: "Tür",
      statusLabel: "Durum",
      docTypes: {
        unknown: "Bilinmiyor",
        letter: "Mektup",
        report: "Rapor",
        certificate: "Sertifika",
        invoice: "Fatura",
        contract: "Sözleşme",
        id: "Kimlik",
        insurance: "Sigorta",
        tax: "Vergi",
        medical: "Sağlık",
        bank: "Banka",
        scan: "Tarama",
        output: "Çıktı",
      },
      statuses: {
        new: "Yeni",
        reviewed: "İncelendi",
        action_needed: "İşlem gerekli",
        done: "Tamamlandı",
        archived: "Arşiv",
      },
      quickTitle: "Hızlı İşlemler",
      selectFile: "Dosya seç",
      quickActions: {
        translateTr: "Türkçeye çevir",
        translateDe: "Almancaya çevir",
        translateEn: "İngilizceye çevir",
        summarize: "Özetle",
        read: "Oku / incele",
        reconstruct: "PDF'den Word'e",
      },
      runAction: "Çalıştır",
      actionPrompts: {
        translateTr: (name) => `${name} dosyasını Türkçeye çevir ve gerçek indirme linkini ver.`,
        translateDe: (name) => `${name} dosyasını Almancaya çevir ve gerçek indirme linkini ver.`,
        translateEn: (name) => `${name} dosyasını İngilizceye çevir ve gerçek indirme linkini ver.`,
        summarize: (name) => `${name} dosyasını oku ve önemli noktaları net şekilde özetle.`,
        read: (name) => `${name} dosyasını oku; ne tür bir belge olduğunu ve önemli detayları söyle.`,
        reconstruct: (name) => `${name} dosyasını temiz formatlı bir Word belgesine dönüştür ve indirme linkini ver.`,
      },
      groupLabels: { Inputs: "Girdiler", Outputs: "Çıktılar" },
    },
    memory: {
      title: "Hafıza & Sözlük",
      memories: "Notlar",
      glossary: "Sözlük",
      emptyMemories: "Henüz kayıt yok. DocFlow'dan bir şeyi hatırlamasını iste.",
      emptyGlossary: "Sözlük terimi yok.",
      long: "kalıcı",
      session: "oturum",
      clearAll: "Tümünü sıfırla",
      clearConfirm: "Tüm notlar silinsin mi? Bu geri alınamaz.",
      removeOne: "Notu sil",
    },
    jobs: { title: "İşler", empty: "Henüz iş yok.", running: "çalışıyor", done: "bitti", error: "hata" },
  },
};
