// Fingering assignment algorithm ported from pianoplayer
// https://github.com/marcomusy/pianoplayer/

// Constants and configurations
const fingers = [1, 2, 3, 4, 5];
const handSizes = {
    'XXS': 0.80,
    'XS': 0.85,
    'S': 0.90,
    'M': 1.00,
    'L': 1.05,
    'XL': 1.10,
    'XXL': 1.15
};

class Note {
    constructor(data) {
        // Extract necessary properties from the note data
        this.name = data.noteName || data.notePitch || '';
        this.isChord = data.isChord || false;
        this.isBlack = isBlackKey(data.note % 12);
        this.pitch = data.note;
        this.octave = data.octave || Math.floor(data.note / 12) - 1;
        this.x = keyPosition(this.pitch);
        this.time = data.start || data.time || 0;
        this.duration = data.duration || 0;
        this.fingering = data.finger || 0;
        this.measure = data.measure || 0;
        this.chordId = data.chordID || 0;
        this.chordNr = data.chordnr || 0;
        this.nInChord = data.NinChord || 0;
        this.noteId = data.id || 0;
        this.data = data; // Reference to the original data object
    }
}

class Hand {
    constructor(noteseq, side = 'right', size = 'M') {
        this.side = side;
        this.frest = [null, -7.0, -2.8, 0.0, 2.8, 5.6]; // Finger positions at rest (cm)
        this.weights = [null, 1.1, 1.0, 1.1, 0.9, 0.8]; // Finger relative strength
        this.bfactor = [null, 0.3, 1.0, 1.1, 0.8, 0.7]; // Bias for black keys
        this.noteseq = noteseq; // Array of Note objects
        this.fingerseq = [];
        this.depth = 9;
        this.autodepth = true;
        this.size = size;
        this.hf = handSizes[size];
        for (let i = 1; i <= 5; i++) {
            if (this.frest[i]) this.frest[i] *= this.hf;
        }
        this.cfps = [...this.frest]; // Current finger positions
        this.cost = -1;
    }

    setFingerPositions(fings, notes, i) {
        const fi = fings[i];
        const ni = notes[i];
        const ifx = this.frest[fi];
        if (ifx !== null && ni) {
            for (let j = 1; j <= 5; j++) {
                const jfx = this.frest[j];
                this.cfps[j] = (jfx - ifx) + ni.x;
            }
        }
    }

    averageVelocity(fingering, notes) {
        this.setFingerPositions(fingering, notes, 0); // Initialize finger positions
        let vmean = 0;
        for (let i = 1; i < fingering.length; i++) {
            const na = notes[i - 1];
            const nb = notes[i];
            const fb = fingering[i];
            if (!na || !nb || !fb) continue; // Prevent accessing undefined
            const dx = Math.abs(nb.x - this.cfps[fb]); // Distance traveled by finger fb
            const dt = Math.abs(nb.time - na.time) + 0.1; // Available time + smoothing term
            let v = dx / dt; // Velocity
            if (nb.isBlack) {
                v /= this.weights[fb] * this.bfactor[fb];
            } else {
                v /= this.weights[fb];
            }
            vmean += v;
            this.setFingerPositions(fingering, notes, i); // Update finger positions
        }
        return vmean / (fingering.length - 1);
    }

    skip(fa, fb, na, nb, level) {
        if (!na || !nb) return true;
        const xba = nb.x - na.x; // Distance between notes
        // Simplified skip rules
        if (!na.isChord && !nb.isChord) {
            if (fa === fb && xba && na.duration < 4) return true;
            if (fa > 1) {
                if (fb > 1 && (fb - fa) * xba < 0) return true;
                if (fb === 1 && nb.isBlack && xba > 0) return true;
            } else {
                if (na.isBlack && xba < 0 && fb > 1 && na.duration < 2) return true;
            }
        }
        return false;
    }

    optimizeSeq(nseq, istart) {
        const depth = Math.min(this.depth, nseq.length);
        const fingers = [1, 2, 3, 4, 5];
        const u_start = istart ? [istart] : fingers;
        let out = { fingering: Array(depth).fill(0), velocity: -1 };
        let minvel = 1e10;

        // Generate all possible fingering combinations recursively
        const generateFingerings = (level, currentFingering) => {
            if (level === depth) {
                const v = this.averageVelocity(currentFingering, nseq);
                if (v < minvel) {
                    out = { fingering: [...currentFingering], velocity: v };
                    minvel = v;
                }
                return;
            }

            for (const f of fingers) {
                if (level > 0) {
                    const prevFing = currentFingering[level - 1];
                    const na = nseq[level - 1];
                    const nb = nseq[level];
                    if (!na || !nb) continue; // Prevent accessing undefined
                    if (this.skip(prevFing, f, na, nb, level)) continue;
                }
                currentFingering[level] = f;
                generateFingerings(level + 1, currentFingering);
            }
        };

        for (const f1 of u_start) {
            generateFingerings(1, [f1, ...Array(depth - 1).fill(0)]);
        }

        return out;
    }

    generate() {
        const N = this.noteseq.length;
        if (this.depth < 3) this.depth = 3;
        if (this.depth > 9) this.depth = 9;
        let start_finger = 0;
        let out = { fingering: [], velocity: 0 };

        for (let i = 0; i < N; i++) {
            const an = this.noteseq[i];
            let remainingNotes = N - i;
            let currentDepth = Math.min(this.depth, remainingNotes);
            if (currentDepth < 2) continue; // Not enough notes to process

            // Adjust depth for the last notes
            this.depth = currentDepth;

            let best_finger = 0;
            const notesSlice = this.noteseq.slice(i, i + currentDepth);
            out = this.optimizeSeq(notesSlice, start_finger);
            best_finger = out.fingering[0];
            start_finger = out.fingering[1] || 0;

            an.fingering = best_finger;
            this.setFingerPositions(out.fingering, notesSlice, 0);
            this.fingerseq.push([...this.cfps]);
            an.cost = out.velocity;
        }
    }
}

// Utility functions
function isBlackKey(midiNote) {
    const pc = midiNote % 12;
    return [1, 3, 6, 8, 10].includes(pc);
}

function keyPosition(midiNote) {
    // Simplified key position based on midi note number
    return midiNote;
}

// File processing and UI logic

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const downloadLink = document.getElementById('download-link');
const outputDiv = document.getElementById('output');
const handSizeSelect = document.getElementById('hand-size-select');

// Handle drag over
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('hover');
});

// Handle drag leave
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('hover');
});

// Handle drop
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
        processFile(file);
    } else {
        alert('Please drop a valid JSON file.');
    }
});

// Handle click to open file dialog
dropZone.addEventListener('click', () => {
    fileInput.click();
});

// Handle file selection
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file && file.type === 'application/json') {
        processFile(file);
    } else {
        alert('Please select a valid JSON file.');
    }
});

function processFile(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const handSize = handSizeSelect.value;
            const updatedData = processJSON(data, handSize);

            // Display updated JSON in output div (optional)
            outputDiv.textContent = JSON.stringify(updatedData, null, 2);

            // Create a Blob from the JSON data and set up download link
            const blob = new Blob([JSON.stringify(updatedData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = file.name.replace('.json', '_updated.json');
            downloadLink.style.display = 'inline';
        } catch (error) {
            alert('Error processing JSON file: ' + error.message);
        }
    };

    reader.readAsText(file);
}

function processJSON(data, handSize) {
    // Validate that tracksV2 exists and is an object
    if (!data.tracksV2 || typeof data.tracksV2 !== 'object') {
        alert('No valid tracksV2 data found in JSON.');
        return data;
    }

    // Process right and left hands
    for (const hand of ['right', 'left']) {
        if (Array.isArray(data.tracksV2[hand])) {
            // Flatten all notes from blocks
            let allNotes = [];
            data.tracksV2[hand].forEach((block) => {
                if (Array.isArray(block.notes)) {
                    block.notes.forEach((noteData) => {
                        var note = new Note(noteData);
                        if (hand == 'left') {
                            // play left as a right on a mirrored keyboard
                            note.x = -note.x;
                        }
                        allNotes.push(note);
                    });
                }
            });

            if (allNotes.length === 0) continue;

            // Create Hand instance and generate fingerings
            const handObj = new Hand(allNotes, hand, handSize);
            handObj.generate();

            // Update the original data with the assigned fingers
            let noteIndex = 0;
            data.tracksV2[hand].forEach((block) => {
                if (Array.isArray(block.notes)) {
                    block.notes.forEach((noteData) => {
                        if (allNotes[noteIndex]) {
                            noteData.finger = allNotes[noteIndex].fingering;
                        }
                        noteIndex++;
                    });
                }
            });
        }
    }

    return data;
}