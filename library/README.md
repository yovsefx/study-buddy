# Your library

Put your own PDFs (lecture notes, textbooks, old exams) here, one folder per module id from
`app/config/modules.json`, for example:

```
library/
  analysis/Skript-Analysis.pdf
  mechanik/Uebungsblatt-3.pdf
  allgemein/Pruefungsordnung.pdf
```

On start the server imports every PDF it has not seen yet, extracts the text page by page and
indexes it for the tutor's search. Folders that don't match a module id go to `allgemein`.
You can also upload PDFs in the app (Library page) or send them in a chat.

Everything in this folder except this README is ignored by git.
