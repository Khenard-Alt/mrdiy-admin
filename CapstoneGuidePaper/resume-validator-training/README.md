# Resume Validator v2 — Python Training Stack

Reference para sa pag-assess ng ginamit na Python libraries. Tingnan din ang
`CapstoneGuidePaper/AIplanning.md` §5.6 para sa buong arkitektura at desisyon.

**Mahalagang konteksto bago ang listahan:** offline/training-only ang Python dito
(§5.6) — walang Python na tumatakbo sa live system. Ang training (pagsasanay ng
model) ay ginagawa lang isang beses, sa computer/notebook, bago pa ilunsad ang app.

---

## Ano ang nasa `requirements.txt`, at para saan ang bawat isa

| Library | Para saan | Bakit ito kailangan |
|---|---|---|
| **pandas** | Pagbasa at pag-aayos ng dataset (CSV → table) | Ang `train_resume_validator.py` ay nagbabasa ng dataset sa `text,label` columns gamit ang `pd.read_csv()`, at ginagamit ang DataFrame para sa duplicate-checking, class-balance checking (§5.6 checklist) |
| **scikit-learn** | **Ito ang totoong ML library** — nagbibigay ng: <br>• `TfidfVectorizer` — ginagawang numero (TF-IDF vectors) ang text <br>• `LogisticRegression`, `MultinomialNB`, `LinearSVC` — ang 3 candidate na classifier na ikinukumpara namin <br>• `train_test_split` — paghahati ng data (80/20) <br>• `classification_report`, `confusion_matrix`, `f1_score` — pagsukat ng galing ng model | Ito ang puso ng buong training — dito nangyayari ang "pagkatuto" ng model mula sa dataset |
| **numpy** | Numerical operations (mga array/matrix) | Dependency ng scikit-learn mismo — ginagamit sa ilalim ng TF-IDF vectors at model weights |
| **jupyter** | Interactive notebook environment | Para magamit ang `# %%` cell markers sa VS Code (Shift+Enter bawat cell, parang notebook) sa halip na patakbuhin ang buong script nang sabay-sabay |
| **pyarrow** | Pagbasa ng `.parquet` files | Kailangan para ma-download/mabasa ang dataset mula sa Hugging Face (nakaimbak doon bilang parquet, mas mabilis at mas maliit kaysa CSV para sa malalaking dataset) |

---

## "Pytorch, para saan yan?" — HINDI namin ginamit, at sinasadya 'yon

**Walang PyTorch (o TensorFlow) sa proyekto namin.** Hindi ito nakalimutan — desisyon ito, at ito ang dahilan:

| | PyTorch/TensorFlow (Deep Learning) | scikit-learn (Classical ML) — ginamit namin |
|---|---|---|
| **Akma para sa** | Neural networks, malalaking dataset (libo-libong hanggang milyon-milyong examples), kumplikadong gawain (larawan, audio, malalim na language understanding) | Simpleng binary classification (resume ba o hindi), maliit-hanggang-katamtamang dataset — eksaktong gawain namin |
| **Laki ng dataset na kailangan** | Karaniwang libo-libo hanggang milyon-milyon para hindi mag-overfit | Daan-daan hanggang libo-libong examples ay sapat na — bagay sa totoong laki ng dataset namin |
| **Bilis ng training** | Minuto hanggang oras, kailangan pa ng GPU para sa malalaking modelo | Segundo hanggang ilang minuto lang, sapat na ang ordinaryong CPU |
| **Pagiging "explainable"** | Mahirap ipaliwanag kung bakit ganito ang desisyon ("black box") | Direktang makikita ang bawat salita at ang timbang (weight) nito sa desisyon — tugma sa Explainable AI na tema ng buong proyekto (§3, §5.7B) |
| **Pag-export papuntang production** | Kailangan ng ONNX runtime, TensorFlow.js, o katulad — bagong dependency sa Next.js/Android app | Ang isang Logistic Regression model ay **ilang numero lang** (weights + vocabulary) — direktang kayang gawin ulit sa TypeScript, walang bagong library na kailangan (tingnan ang `export_logistic_regression()` sa `train_resume_validator.py`) |

**Sa madaling salita:** overkill ang PyTorch/TensorFlow para sa gawain naming "resume ba ito o hindi" — parang gumamit ng traktora para magtanim ng isang paso. Ang scikit-learn ay sapat na, mas mabilis, mas madaling ipaliwanag, at mas madaling i-deploy nang walang dagdag na dependency sa totoong app.

---

## Buod ng buong flow

```
pandas       → basahin ang dataset
scikit-learn → gawing numero ang text (TfidfVectorizer), hatiin (train_test_split),
                turuan ang 3 model, sukatin (classification_report/f1_score)
numpy        → (ginagamit sa ilalim ng scikit-learn, hindi direktang tinatawag)
jupyter      → paraan lang para patakbuhin nang paisa-isang cell sa VS Code
```

Walang anuman dito ang tumatakbo sa live/production system — basahin ang
`CapstoneGuidePaper/AIplanning.md` §5.6 para sa buong paliwanag kung paano
isinasalin ang natutunang model papuntang TypeScript para sa totoong paggamit.
