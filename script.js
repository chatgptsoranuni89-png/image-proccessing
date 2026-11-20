
const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const dropzone = $("dropzone");
const previewImage = $("previewImage");
const placeholder = $("placeholder");
const fileName = $("fileName");
const processBtn = $("processBtn");
const processStatus = $("processStatus");
const resultsContent = $("resultsContent");
const resultPlaceholder = $("resultPlaceholder");
const compareBefore = $("compareBefore");
const compareAfter = $("compareAfter");
const comparison = $("comparison");
const comparisonLine = $("comparisonLine");
const comparisonRange = $("comparisonRange");
const sliderValue = $("sliderValue");
const ocrBefore = $("ocrBefore");
const ocrText = $("ocrText");
const stageViewer = $("stageViewer");
const stageTitle = $("stageTitle");
const stageDescription = $("stageDescription");
const sourcePreview = $("sourcePreview");
const cropMode = $("cropMode");
const cropSelection = $("cropSelection");
const cropStatus = $("cropStatus");
const resetCropBtn = $("resetCropBtn");

const labels = {
    grayscale: [
        "Grayscale",
        "Convert the document to a single brightness channel."
    ],
    denoised: [
        "Noise Removal",
        "Reduce small speckles while preserving more of the text."
    ],
    enhanced: [
        "Enhancement",
        "Normalize the background and reduce uneven illumination."
    ],
    binary: [
        "Thresholding",
        "Separate dark marks from the background using adaptive thresholding."
    ]
};

let lastResult = null;
let sourceDataUrl = "";
let processing = false;
let cropRect = null;
let cropStart = null;
let cropping = false;

// RESET RESULTS

function resetResults() {
    lastResult = null;
    resultsContent.hidden = true;
    resultPlaceholder.hidden = false;
    resultPlaceholder.textContent =
        "Upload an image and click Process Document to see the results.";
}

// SELECT FILE

function selectFile(file) {
    if (processing) return;

    resetResults();
    clearCrop();
    processBtn.disabled = true;

    if (!file) {
        sourceDataUrl = "";
        previewImage.hidden = true;
        placeholder.hidden = false;
        fileName.textContent = "No file selected";
        return;
    }

    if (
        !["image/jpeg", "image/png"].includes(file.type) ||
        file.size > 8 * 1024 * 1024
    ) {
        alert("Please choose a JPG or PNG smaller than 8 MB.");
        fileInput.value = "";
        selectFile(null);
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        sourceDataUrl = String(reader.result);
        previewImage.src = sourceDataUrl;
        previewImage.hidden = false;
        placeholder.hidden = true;
        fileName.textContent = file.name;
        processStatus.textContent = "Image ready to process";
        processBtn.disabled = false;
    };

    reader.onerror = () => {
        processStatus.textContent = "Could not open the image";
        selectFile(null);
    };

    reader.readAsDataURL(file);
}

fileInput.addEventListener("change", () => {
    selectFile(fileInput.files[0]);
});

// DRAG AND DROP

["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (!processing) {
            dropzone.classList.add("dragging");
        }
    });
});

["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
    });
});

dropzone.addEventListener("drop", (event) => {
    if (processing || !event.dataTransfer.files.length) return;

    const file = event.dataTransfer.files[0];

    try {
        fileInput.files = event.dataTransfer.files;
    } catch (_err) {
        alert(
            "Drag-and-drop is not supported here; please choose the file instead."
        );
        return;
    }

    selectFile(file);
});

// BEFORE / AFTER SLIDER

function setComparison(value) {
    const percent = Math.max(
        0,
        Math.min(100, Number(value))
    );

    compareAfter.style.clipPath =
        `inset(0 ${100 - percent}% 0 0)`;

    comparisonLine.style.left = `${percent}%`;
    comparisonRange.value = String(percent);
    sliderValue.textContent = `${Math.round(percent)}%`;
}

comparisonRange.addEventListener("input", () => {
    setComparison(comparisonRange.value);
});

// DRAG COMPARISON DIVIDER

let dragging = false;

comparison.addEventListener("pointerdown", (event) => {
    dragging = true;
    comparison.setPointerCapture(event.pointerId);
    updateFromPointer(event);
});

comparison.addEventListener("pointermove", (event) => {
    if (dragging) updateFromPointer(event);
});

["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => {
    comparison.addEventListener(name, () => {
        dragging = false;
    });
});

function updateFromPointer(event) {
    const rect = comparison.getBoundingClientRect();

    setComparison(
        ((event.clientX - rect.left) / rect.width) * 100
    );
}

// PROCESSING STAGES

function showStage(key) {
    if (!lastResult || !lastResult.steps[key]) return;

    stageViewer.src = lastResult.steps[key];
    stageTitle.textContent = labels[key][0];
    stageDescription.textContent = labels[key][1];

    document.querySelectorAll(".stage-card").forEach((card) => {
        const active = card.dataset.stage === key;
        card.classList.toggle("active", active);
        card.setAttribute("aria-pressed", String(active));
    });
}

document.querySelectorAll(".stage-card").forEach((card) => {
    card.addEventListener("click", () => {
        showStage(card.dataset.stage);
    });
});

// PROCESS DOCUMENT

processBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];

    if (!file || processing) return;

    processing = true;
    processBtn.disabled = true;
    fileInput.disabled = true;
    processBtn.textContent = "Processing…";
    processStatus.textContent = "Applying image processing and OCR…";

    resultsContent.hidden = true;
    resultPlaceholder.hidden = false;
    resultPlaceholder.textContent = "Processing your document…";

    try {
        const formData = new FormData();
        formData.append("file", file);

        if (cropMode.checked && cropRect) {
            formData.append("crop", JSON.stringify(cropRect));
        }

        const response = await fetch("/process", {
            method: "POST",
            body: formData
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error || `Server error ${response.status}`
            );
        }

        if (!result.enhanced_image || !result.steps) {
            throw new Error("Missing image results from Flask.");
        }

        lastResult = result;

        compareBefore.src = result.source_image || sourceDataUrl;
        compareAfter.src = result.enhanced_image;

        for (const key of Object.keys(labels)) {
            const stageImage = $("stage-" + key);
            stageImage.src = result.steps[key];
        }

        showStage("grayscale");

        ocrBefore.textContent =
            result.text_before?.trim() || "No text detected.";

        ocrText.textContent =
            result.text?.trim() || "No text detected.";

        setComparison(50);

        resultPlaceholder.hidden = true;
        resultsContent.hidden = false;

        processStatus.textContent = result.cropping_enabled
            ? "Manual crop applied — review all four stages below"
            : "Full image processed — review all four stages below";

    } catch (error) {
        resetResults();
        resultPlaceholder.textContent = error.message;
        processStatus.textContent = "Processing failed";

    } finally {
        processing = false;
        fileInput.disabled = false;
        processBtn.disabled = !fileInput.files.length;
        processBtn.textContent = "Process Document →";
    }
});

// DOWNLOAD

function downloadData(uri, filename) {
    const anchor = document.createElement("a");
    anchor.href = uri;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
}

$("downloadImageBtn").addEventListener("click", () => {
    if (lastResult) {
        downloadData(
            lastResult.enhanced_image,
            "docvision-enhanced.png"
        );
    }
});

$("downloadTextBtn").addEventListener("click", () => {
    if (!lastResult) return;

    const blob = new Blob(
        [lastResult.text || ""],
        { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    downloadData(url, "docvision-ocr.txt");

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
});

// COPY OCR TEXT

$("copyTextBtn").addEventListener("click", async () => {
    if (!lastResult) return;

    try {
        await navigator.clipboard.writeText(
            lastResult.text || ""
        );

        $("copyTextBtn").textContent = "Copied!";

        setTimeout(() => {
            $("copyTextBtn").textContent = "Copy extracted text";
        }, 1400);

    } catch (error) {
        alert(
            "Could not copy text. Please select the OCR text manually."
        );
    }
});

setComparison(50);

// ==========================================
// LESSON 20 - MANUAL CROP
// ==========================================

function clearCrop() {
    cropRect = null;
    cropStart = null;
    cropping = false;
    cropSelection.hidden = true;

    cropStatus.textContent = cropMode.checked
        ? "Drag across the page to select a rectangular crop."
        : "Crop off — the complete image will be processed.";
}

function displayedImageBounds() {
    if (
        !previewImage.complete ||
        !previewImage.naturalWidth ||
        previewImage.hidden
    ) {
        return null;
    }

    const rect = previewImage.getBoundingClientRect();

    const scale = Math.min(
        rect.width / previewImage.naturalWidth,
        rect.height / previewImage.naturalHeight
    );

    const w = previewImage.naturalWidth * scale;
    const h = previewImage.naturalHeight * scale;

    return {
        left: rect.left + (rect.width - w) / 2,
        top: rect.top + (rect.height - h) / 2,
        width: w,
        height: h
    };
}

function pointerToNormalized(event, bounds, requireInside = false) {
    let x = (event.clientX - bounds.left) / bounds.width;
    let y = (event.clientY - bounds.top) / bounds.height;

    if (
        requireInside &&
        (x < 0 || x > 1 || y < 0 || y > 1)
    ) {
        return null;
    }

    return {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y))
    };
}

function paintCropSelection() {
    const bounds = displayedImageBounds();

    if (!bounds || !cropRect) {
        cropSelection.hidden = true;
        return;
    }

    const parent = sourcePreview.getBoundingClientRect();

    cropSelection.style.left =
        `${bounds.left - parent.left + cropRect.x * bounds.width}px`;

    cropSelection.style.top =
        `${bounds.top - parent.top + cropRect.y * bounds.height}px`;

    cropSelection.style.width =
        `${cropRect.width * bounds.width}px`;

    cropSelection.style.height =
        `${cropRect.height * bounds.height}px`;

    cropSelection.hidden = false;
}

function updateCrop(event) {
    const bounds = displayedImageBounds();

    if (!bounds || !cropStart) return;

    const p = pointerToNormalized(event, bounds);

    cropRect = {
        x: Math.min(cropStart.x, p.x),
        y: Math.min(cropStart.y, p.y),
        width: Math.abs(p.x - cropStart.x),
        height: Math.abs(p.y - cropStart.y)
    };

    paintCropSelection();
}

sourcePreview.addEventListener("pointerdown", (event) => {
    if (!cropMode.checked || processing) return;

    const bounds = displayedImageBounds();
    if (!bounds) return;

    const start = pointerToNormalized(event, bounds, true);
    if (!start) return;

    event.preventDefault();

    cropStart = start;
    cropRect = null;
    cropping = true;

    sourcePreview.setPointerCapture(event.pointerId);

    cropStatus.textContent = "Selecting document region…";
});

sourcePreview.addEventListener("pointermove", (event) => {
    if (cropping) updateCrop(event);
});

function finishCrop(event) {
    if (!cropping) return;

    updateCrop(event);

    cropping = false;
    cropStart = null;

    if (
        !cropRect ||
        cropRect.width < 0.04 ||
        cropRect.height < 0.04
    ) {
        clearCrop();
        cropStatus.textContent =
            "Selection too small. Please choose a larger region.";
    } else {
        cropStatus.textContent =
            "Crop selected. Click Process Document to use this region.";
    }

    resetResults();
}

sourcePreview.addEventListener("pointerup", finishCrop);

sourcePreview.addEventListener("pointercancel", () => {
    if (cropping) clearCrop();
});

cropMode.addEventListener("change", () => {
    sourcePreview.classList.toggle(
        "crop-active",
        cropMode.checked
    );

    clearCrop();
    resetResults();
});

resetCropBtn.addEventListener("click", () => {
    clearCrop();
    resetResults();
});

window.addEventListener("resize", paintCropSelection);

// ==========================================
// LESSON 21 - OCR ACCURACY EVALUATION
// ==========================================

const referenceTextInput = $("referenceText");
const evaluateBtn = $("evaluateBtn");
const clearReferenceBtn = $("clearReferenceBtn");
const accuracyFeedback = $("accuracyFeedback");
const accuracyResults = $("accuracyResults");
const accuracySummary = $("accuracySummary");


// Normalize capitalization and whitespace
function normalizeCharacters(text) {
    return String(text || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}


// Tokenize words for WER
function normalizeWords(text) {
    return normalizeCharacters(text)
        .match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) || [];
}


// Levenshtein Edit Distance
function editDistance(first, second) {

    // Keep the shorter sequence in the DP row
    if (second.length > first.length) {
        [first, second] = [second, first];
    }

    const row = Array.from(
        { length: second.length + 1 },
        (_, index) => index
    );

    for (let i = 1; i <= first.length; i++) {

        let diagonal = row[0];
        row[0] = i;

        for (let j = 1; j <= second.length; j++) {

            const above = row[j];

            const cost =
                first[i - 1] === second[j - 1] ? 0 : 1;

            row[j] = Math.min(
                above + 1,
                row[j - 1] + 1,
                diagonal + cost
            );

            diagonal = above;
        }
    }

    return row[second.length];
}


// Calculate error rate in percent
function calculateErrorRate(reference, prediction) {

    if (reference.length === 0) {
        return null;
    }

    const errors = editDistance(reference, prediction);

    return (errors / reference.length) * 100;
}


// Describe before/after improvement
function describeChange(name, before, after) {

    const difference = before - after;

    if (Math.abs(difference) < 0.01) {
        return `${name}: No significant change.`;
    }

    if (difference > 0) {
        return `${name}: Improved by ${difference.toFixed(2)} percentage points.`;
    }

    return `${name}: Worsened by ${Math.abs(difference).toFixed(2)} percentage points.`;
}


// Hide old evaluation results
function resetAccuracyEvaluation(clearText = false) {

    accuracyResults.hidden = true;

    accuracyFeedback.textContent =
        "Enter the exact original text to evaluate OCR.";

    if (clearText) {
        referenceTextInput.value = "";
    }
}


// Calculate CER and WER
evaluateBtn.addEventListener("click", () => {

    if (!lastResult) {
        accuracyFeedback.textContent =
            "Process a document first.";
        return;
    }

    const reference = referenceTextInput.value.trim();

    if (!reference) {
        accuracyFeedback.textContent =
            "Please enter the correct document text.";
        return;
    }

    const beforeText = lastResult.text_before || "";
    const afterText = lastResult.text || "";

    const refChars = Array.from(
        normalizeCharacters(reference)
    );

    const beforeChars = Array.from(
        normalizeCharacters(beforeText)
    );

    const afterChars = Array.from(
        normalizeCharacters(afterText)
    );

    const refWords = normalizeWords(reference);
    const beforeWords = normalizeWords(beforeText);
    const afterWords = normalizeWords(afterText);

    // Limit work to avoid freezing the browser
    if (
        Math.max(
            refChars.length,
            beforeChars.length,
            afterChars.length
        ) > 3500
    ) {
        accuracyResults.hidden = true;
        accuracyFeedback.textContent =
            "Please evaluate a shorter document (maximum 3500 characters per text).";
        return;
    }

    if (!refChars.length || !refWords.length) {
        accuracyResults.hidden = true;
        accuracyFeedback.textContent =
            "Reference text must contain actual words.";
        return;
    }

    const cerBefore = calculateErrorRate(
        refChars, beforeChars
    );

    const cerAfter = calculateErrorRate(
        refChars, afterChars
    );

    const werBefore = calculateErrorRate(
        refWords, beforeWords
    );

    const werAfter = calculateErrorRate(
        refWords, afterWords
    );

    $("cerBefore").textContent =
        `${cerBefore.toFixed(2)}%`;

    $("cerAfter").textContent =
        `${cerAfter.toFixed(2)}%`;

    $("werBefore").textContent =
        `${werBefore.toFixed(2)}%`;

    $("werAfter").textContent =
        `${werAfter.toFixed(2)}%`;

    accuracySummary.textContent = [
        describeChange("CER", cerBefore, cerAfter),
        describeChange("WER", werBefore, werAfter)
    ].join("\n");

    accuracyFeedback.textContent =
        "Evaluation completed. Lower error rates are better.";

    accuracyResults.hidden = false;
});


// Clear reference
clearReferenceBtn.addEventListener("click", () => {
    resetAccuracyEvaluation(true);
    referenceTextInput.focus();
});


// Clear old reference when selecting a new document
fileInput.addEventListener("change", () => {
    resetAccuracyEvaluation(true);
});


// Hide stale scores when reprocessing
processBtn.addEventListener("click", () => {
    resetAccuracyEvaluation(false);
});

// ==========================================
// LESSON 22 - OCR PERFORMANCE DASHBOARD
// ==========================================

const evaluationReport = $("evaluationReport");
const downloadCsvBtn = $("downloadCsvBtn");

// Get the calculated CER and WER values
function getEvaluationScores() {

    if ($("accuracyResults").hidden) {
        return null;
    }

    const scores = {
        cerBefore: parseFloat($("cerBefore").textContent),
        cerAfter: parseFloat($("cerAfter").textContent),
        werBefore: parseFloat($("werBefore").textContent),
        werAfter: parseFloat($("werAfter").textContent)
    };

    if (!Object.values(scores).every(Number.isFinite)) {
        return null;
    }

    return scores;
}


// Update one bar and its label
function updateMetricBar(barId, labelId, value, maxScale) {

    const width = Math.min(
        100,
        Math.max(0, (value / maxScale) * 100)
    );

    $(barId).style.width = `${width}%`;

    $(labelId).textContent = `${value.toFixed(2)}%`;
}


// Hide the report when results change
function hideEvaluationReport() {
    evaluationReport.hidden = true;
}


// Build the comparison chart
function refreshEvaluationDashboard() {

    const scores = getEvaluationScores();

    if (!scores) {
        hideEvaluationReport();
        return;
    }

    // Dynamic scale (supports error rates above 100%)
    const highest = Math.max(
        scores.cerBefore,
        scores.cerAfter,
        scores.werBefore,
        scores.werAfter
    );

    const maxScale = Math.max(
        10,
        Math.ceil(highest / 10) * 10
    );

    $("chartScaleNote").textContent =
        `Graph scale: 0–${maxScale}% · Lower is better`;

    updateMetricBar(
        "cerBarBefore",
        "cerLabelBefore",
        scores.cerBefore,
        maxScale
    );

    updateMetricBar(
        "cerBarAfter",
        "cerLabelAfter",
        scores.cerAfter,
        maxScale
    );

    updateMetricBar(
        "werBarBefore",
        "werLabelBefore",
        scores.werBefore,
        maxScale
    );

    updateMetricBar(
        "werBarAfter",
        "werLabelAfter",
        scores.werAfter,
        maxScale
    );

    // Reuse the explanation function from Lesson 21
    $("reportInterpretation").textContent = [
        describeChange(
            "CER",
            scores.cerBefore,
            scores.cerAfter
        ),
        describeChange(
            "WER",
            scores.werBefore,
            scores.werAfter
        )
    ].join("\n");

    evaluationReport.hidden = false;
}


// Clear stale scores before evaluation starts.
// This capture listener runs before the Lesson 21 click listener.
evaluateBtn.addEventListener("click", () => {
    $("accuracyResults").hidden = true;
    hideEvaluationReport();
}, { capture: true });


// The Lesson 21 handler calculates values first.
// This listener then builds the dashboard.
evaluateBtn.addEventListener(
    "click",
    refreshEvaluationDashboard
);


// Reset the report if the reference is changed
referenceTextInput.addEventListener("input", () => {

    hideEvaluationReport();
    $("accuracyResults").hidden = true;

    accuracyFeedback.textContent =
        "Reference changed. Calculate again.";
});


// Reset the report when document or crop changes
[
    fileInput,
    processBtn,
    clearReferenceBtn,
    cropMode,
    resetCropBtn
].forEach((element) => {

    element.addEventListener(
        element === fileInput ? "change" : (
            element === cropMode ? "change" : "click"
        ),
        hideEvaluationReport
    );

});

sourcePreview.addEventListener(
    "pointerup",
    hideEvaluationReport
);


// ==========================================
// DOWNLOAD EVALUATION AS CSV
// ==========================================

function escapeCsvCell(value) {

    const text = String(value).replace(/"/g, '""');

    return `"${text}"`;
}


downloadCsvBtn.addEventListener("click", () => {

    const scores = getEvaluationScores();

    if (!scores || !lastResult) {
        alert("Calculate OCR accuracy first.");
        return;
    }

    const rows = [
        ["DocVision OCR - Evaluation Report"],
        ["Generated", new Date().toISOString()],
        [
            "Document Region",
            lastResult.cropping_enabled
                ? "Manual crop"
                : "Full image"
        ],
        [],
        [
            "Metric",
            "Before (%)",
            "After (%)",
            "Change (percentage points)"
        ],
        [
            "CER",
            scores.cerBefore.toFixed(2),
            scores.cerAfter.toFixed(2),
            (scores.cerAfter - scores.cerBefore).toFixed(2)
        ],
        [
            "WER",
            scores.werBefore.toFixed(2),
            scores.werAfter.toFixed(2),
            (scores.werAfter - scores.werBefore).toFixed(2)
        ]
    ];

    const csv = rows
        .map(row => row.map(escapeCsvCell).join(","))
        .join("\r\n");

    // UTF-8 BOM helps Excel recognize encoding
    const blob = new Blob(
        ["\uFEFF", csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);

    downloadData(url, "docvision-evaluation.csv");

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
});

// ==========================================
// LESSON 23 - COMPARE OCR CONFIGURATIONS
// ==========================================

const compareModesBtn =
    document.getElementById("compareModesBtn");

const modesResults =
    document.getElementById("modesResults");

const modesStatus =
    document.getElementById("modesStatus");

const modesTableBody =
    document.getElementById("modesTableBody");


// Hide previous comparison results
function hideModes() {

    modesResults.hidden = true;

    modesTableBody.replaceChildren();
}


// Calculate CER for a configuration
function modeCER(reference, prediction) {

    return calculateErrorRate(
        Array.from(normalizeCharacters(reference)),
        Array.from(normalizeCharacters(prediction))
    );
}


// Calculate WER for a configuration
function modeWER(reference, prediction) {

    return calculateErrorRate(
        normalizeWords(reference),
        normalizeWords(prediction)
    );
}


// ==========================================
// COMPARE BUTTON
// ==========================================

compareModesBtn.addEventListener(
    "click",
    async () => {

        if (
            !lastResult ||
            !fileInput.files[0] ||
            processing
        ) {
            modesStatus.textContent =
                "Process a document first.";
            return;
        }

        const reference =
            document.getElementById(
                "referenceText"
            ).value.trim();

        if (!reference) {
            modesStatus.textContent =
                "Please enter the correct Ground Truth Text.";
            return;
        }

        if (
            Array.from(normalizeCharacters(reference)).length > 3500
        ) {
            modesStatus.textContent =
                "Reference text is too long (max 3500 characters).";
            return;
        }

        hideModes();

        compareModesBtn.disabled = true;

        modesStatus.textContent =
            "Running four OCR configurations...";

        const formData = new FormData();

        formData.append(
            "file",
            fileInput.files[0]
        );

        // Use the selected document region
        if (
            lastResult.cropping_enabled &&
            cropMode.checked &&
            cropRect
        ) {
            formData.append(
                "crop",
                JSON.stringify(cropRect)
            );
        }

        try {

            const response = await fetch(
                "/compare-modes",
                {
                    method: "POST",
                    body: formData
                }
            );

            const result = await response.json()
                .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    result.error || "Server error"
                );
            }

            if (
                !Array.isArray(result.variants) ||
                result.variants.length === 0
            ) {
                throw new Error(
                    "No OCR results returned."
                );
            }

            // Calculate accuracy for every mode
            const scored = result.variants.map(
                (item) => {

                    const text = item.text || "";

                    if (
                        Array.from(
                            normalizeCharacters(text)
                        ).length > 3500
                    ) {
                        throw new Error(
                            "OCR result is too long to evaluate."
                        );
                    }

                    return {
                        ...item,
                        cer: modeCER(reference, text),
                        wer: modeWER(reference, text)
                    };
                }
            );

            // Lowest WER wins.
            // CER is used when WER values are equal.
            scored.sort(
                (a, b) =>
                    a.wer - b.wer ||
                    a.cer - b.cer
            );

            const best = scored[0];

            // Fill comparison table
            scored.forEach((item) => {

                const row =
                    document.createElement("tr");

                if (item.id === best.id) {
                    row.classList.add("best-mode");
                }

                const values = [
                    item.label,
                    item.cer.toFixed(2) + "%",
                    item.wer.toFixed(2) + "%"
                ];

                values.forEach((value) => {

                    const cell =
                        document.createElement("td");

                    cell.textContent = value;

                    row.appendChild(cell);
                });

                modesTableBody.appendChild(row);
            });

            // Explain the result
            document.getElementById(
                "modeBest"
            ).textContent =
                "Lowest-error tested mode: " +
                best.label +
                "\nWER: " + best.wer.toFixed(2) + "%" +
                "\nCER: " + best.cer.toFixed(2) + "%" +
                "\nThis result applies to this document.";

            // Display recognized text
            document.getElementById(
                "modeBestText"
            ).textContent =
                best.text?.trim() ||
                "No text detected.";

            modesResults.hidden = false;

            modesStatus.textContent =
                "Comparison completed successfully.";

        } catch (error) {

            modesStatus.textContent =
                "Comparison failed: " + error.message;

        } finally {

            compareModesBtn.disabled = false;
        }
    }
);


// ==========================================
// RESET WHEN INPUTS CHANGE
// ==========================================

fileInput.addEventListener(
    "change",
    hideModes
);

document.getElementById(
    "referenceText"
).addEventListener(
    "input",
    hideModes
);

processBtn.addEventListener(
    "click",
    hideModes
);

cropMode.addEventListener(
    "change",
    hideModes
);

resetCropBtn.addEventListener(
    "click",
    hideModes
);

sourcePreview.addEventListener(
    "pointerup",
    hideModes
);

