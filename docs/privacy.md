# Privacy

Insonate runs entirely in the browser.

- **No accounts and no analytics.** The app makes no third-party requests. It loads its own files and the patient data, and nothing else.
- **Camera.** Probe Cam asks for the camera only when you open it. Frames go to a `<video>` element and a Web Worker in the same page. They are never stored or uploaded. Closing Probe Cam stops the camera.
- **Local storage.** The only things stored are your theme (dark or light), language (English or Arabic), chosen patient, whether you have seen the welcome card, and your last 40 exam results (exam code, level, score, date and time taken), in `localStorage`. They stay in your browser; clearing site data removes them.
- **Shared links.** A shared link holds the view in the part after `#`, which browsers never send to a server. Mystery-patient links hide the case name, and exam codes the findings, but neither is encrypted.
- **Offline.** After the first visit, a service worker caches the app and the patient data, so Insonate works without a connection.
- **Patient data.** The anatomy comes from a public, de-identified research dataset (TotalSegmentator, CC BY 4.0). No personal health information is involved.
