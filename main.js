// --- DOM References ---
// Get references to all the important HTML elements to interact with them in JS
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const previewBtn = document.getElementById('previewBtn'); // show preview block or not
const themeToggleBtn = document.getElementById('themeToggleBtn'); // Theme toggle in controls
const container = document.querySelector('.container'); // Container holding editor/preview
const editorContainer = document.getElementById('editorContainer'); // Div containing editor + status bar
const editorToolbar = document.getElementById('editorToolbar'); // Toolbar above the editor
const remoteDBSpan = document.getElementById('remoteDB'); // Span in info bar for remote database address
const fileNameSpan = document.getElementById('fileName'); // Span in info bar for file name
const wordCountSpan = document.getElementById('wordCount'); // Span in status bar for word count
const charCountSpan = document.getElementById('charCount'); // Span in status bar for char count
const exportPDF = document.getElementById('exportPDF'); // button to trigger download content as PDF
const saveFileAs = document.getElementById('saveFileAs'); // save current markdown to local PouchDB
const openFileAs = document.getElementById('openFileAs'); // read a file from local PouchDB
const syncFromRemote = document.getElementById('syncFromRemote'); // sync local PouchDB with remote CouchDB
const syncToRemote = document.getElementById('syncToRemote'); // sync remote CouchDB with local PouchDB

// --- Databse References ---
const db = new PouchDB('default'); // our PouchDB instance

// --- State Variables ---
// These variables hold the application's current state
let mdContent = ""; // the markdown content
let reader = new commonmark.Parser();
let writer = new commonmark.HtmlRenderer();
let promptResult = ""; // store the return value from prompt(), of course this is bad practice to keep this as global variable, I just want to skip the "let" everywhere I use prompt().
let remoteDBAddress = "-";

let currentTheme = 'dark'; // Tracks the current theme ('light' or 'dark')
let autoSaveTimer = null; // Timer ID for debouncing auto-save to localStorage

// --- Core Helper Functions ---
/**
 * Updates the preview pane by parsing the editor's content using 'marked'.
 * Handles potential parsing errors.
 */
function updatePreview() {
    MathJax.typesetClear();
    
    if (editor.value != "") { // Only update if a note is active
        const contentToRender = editor.value; // Get current editor content
        try {
            preview.innerHTML = writer.render(reader.parse(contentToRender)); // Parse and set HTML
            // Add checkbox functionality after render (needs revisiting if checkboxes become interactive)
            // preview.querySelectorAll('.task-list-item input[type="checkbox"]').forEach(checkbox => { checkbox.disabled = false; /* Or add event listeners */ });
        } catch(e){
            console.error("Markdown Parsing Error:", e);
            preview.innerHTML = "<p>Error parsing Markdown.</p>"; // Show error in preview
        }
    } else {
        preview.innerHTML = ''; // Clear preview if no note is active
    }
    
    MathJax.typesetPromise();
}

/**
 * Updates the status bar with the current word and character counts from the editor.
 */
function updateStatusBar() {
    const content = editor.value;
    const charCount = content.length;
    // Basic word count: split by whitespace, filter empty strings
    const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
    charCountSpan.textContent = `Chars: ${charCount}`;
    wordCountSpan.textContent = `Words: ${wordCount}`;
}

/**
 * Pop out a quest to rename current file
 */
function renameDocQuest() {
    let defaultName = "untitled";
    if (fileNameSpan.textContent === "untitled") {
	defaultName = "";
    } else {
	defaultName = fileNameSpan.textContent;
    }
    promptResult = prompt("Please enter new file name", defaultName);
    if (promptResult != null) {
	fileNameSpan.textContent = promptResult;
    } else {
	// nothing to be done here
    }
}
/**
 * Pop out a quest to change remote CouchDB address
 */
function changeRemoteDBAddress() {
    let defaultAddress = "";
    if (remoteDBSpan.textContent === "-") {
	defaultAddress = "";
    } else {
	defaultAddress = remoteDBSpan.textContent;
    }
    promptResult = prompt("Please enter remote CouchDB address", defaultAddress);
    if (promptResult != null) {
	remoteDBSpan.textContent = promptResult;
    } else {
	// nothing to be done here
    }
}

// --- UI Rendering Functions ---

/**
 * Calls all necessary rendering functions to update the entire UI.
 * Includes error handling for each sub-render function.
 */
function renderUI() {
    try { updateStatusBar(); } catch(e){ console.error("Error in updateStatusBar:", e); }
    // updatePreview() is usually called separately after content changes or tab switches
}

// --- Note Management Functions ---

/**
 * Adds a new note
 * Generates a unique name if none is provided.
 * @param {string|null} [name=null] - The desired name for the note. If null, generates "Untitled X".
 * @param {string} [content=''] - The initial content for the note.
 * @returns {number} The ID of the newly created note.
 */
function addNote(content = '') {
    editor.value = content;
    updatePreview();
    renderUI();
    saveStateToLocalStorage();
}

function togglePreview() {
    if (editorContainer.style.display !== "none" && preview.style.display !== "none") {
	preview.style.display = "none";
    } else if (editorContainer.style.display !== "none" && preview.style.display === "none") {
	preview.style.display = "block";
	editorContainer.style.display = "none";
    } else {
	editorContainer.style.display = "flex";
    }
}

// --- Markdown Toolbar Logic ---

/**
 * Applies Markdown formatting syntax around the selected text in the editor,
 * or inserts the syntax with a placeholder if no text is selected.
 * @param {string} syntaxStart - The Markdown syntax to add before the selection (e.g., '**', '# ').
 * @param {string|null} [syntaxEnd=null] - The syntax to add after the selection (e.g., '**'). If null, uses syntaxStart.
 * @param {string} [placeholder='text'] - Placeholder text to insert if nothing is selected.
 * @param {boolean} [isBlock=false] - If true, ensures the syntax starts on a new line. Special handling for '---'.
 */
function applyMarkdownFormatting(syntaxStart, syntaxEnd = null, placeholder = 'text', isBlock = false) {
    const start = editor.selectionStart; // Start position of selection
    const end = editor.selectionEnd; // End position of selection
    const selectedText = editor.value.substring(start, end); // The actual selected text

    let textToInsert = '';
    let finalSelectionStart = start; // Will be updated to place cursor/selection correctly
    let finalSelectionEnd = end;

    // If syntaxEnd is not provided, assume it's the same as syntaxStart (e.g., for *, **, `)
    syntaxEnd = syntaxEnd ?? syntaxStart;

    let prefix = ''; // Characters to add before the start syntax (e.g., newline)
    let suffix = ''; // Characters to add after the end syntax (rarely needed)

    // Ensure block elements (like headings, lists, hr, blockquote) start on a new line
    if (isBlock && start !== 0 && editor.value[start - 1] !== '\n') {
        prefix = '\n'; // Add a newline if not already at the start of a line
    }

    // Special handling for Horizontal Rule (---)
    if (syntaxStart === '---') {
        // Ensure HR is on its own line, potentially surrounded by blank lines
        prefix = (start !== 0 && editor.value[start - 1] !== '\n') ? '\n\n' // Needs two newlines if previous char exists and isn't newline
            : (start !== 0 && editor.value[start-1] === '\n' ? '\n'      // Needs one newline if previous char is newline
               : '');                                                         // Needs no newline if at start of editor
        syntaxStart = `${prefix}---\n`; // Add prefix and required newline after ---
        syntaxEnd = ''; // No ending syntax for HR
        placeholder = ''; // No placeholder for HR
        textToInsert = syntaxStart;
        // Place cursor after the inserted HR
        finalSelectionStart = start + syntaxStart.length;
        finalSelectionEnd = finalSelectionStart;
    }
    // Handling for when text IS selected
    else if (selectedText) {
        textToInsert = `${prefix}${syntaxStart}${selectedText}${syntaxEnd}${suffix}`;
        // Place cursor after the inserted text (no selection)
        // finalSelectionStart = start + textToInsert.length;
        // finalSelectionEnd = finalSelectionStart;
        // Or re-select the original text within the new syntax (usually better)
        finalSelectionStart = start + prefix.length + syntaxStart.length;
        finalSelectionEnd = finalSelectionStart + selectedText.length;
    }
    // Handling for when NO text is selected
    else {
        textToInsert = `${prefix}${syntaxStart}${placeholder}${syntaxEnd}${suffix}`;
        // Place the cursor inside the syntax, selecting the placeholder
        finalSelectionStart = start + prefix.length + syntaxStart.length;
        finalSelectionEnd = finalSelectionStart + placeholder.length;
    }

    // Use setRangeText for better undo/redo support than manipulating editor.value directly
    editor.setRangeText(textToInsert, start, end, 'end'); // Replace selection (or insert)

    // Adjust selection after insertion
    if (!selectedText && placeholder && syntaxStart !== '---') {
        // If no text was selected initially and we inserted a placeholder, select the placeholder
        editor.setSelectionRange(finalSelectionStart, finalSelectionEnd);
    } else if (selectedText && syntaxStart !== '---') {
        // If text was selected, keep it selected within the new syntax
        // This happens automatically with 'end' in setRangeText if syntaxEnd is empty,
        // but needs explicit setting if syntaxEnd exists. Let's be explicit.
        editor.setSelectionRange(finalSelectionStart, finalSelectionEnd);
    } else {
        // Otherwise (like HR or after replacing selected text), just place the cursor at the end
        editor.setSelectionRange(editor.selectionEnd, editor.selectionEnd);
    }


    editor.focus(); // Return focus to the editor
    updatePreview(); // Update the preview pane
    updateStatusBar(); // Update word/char count
}


// --- Editor Auto Behaviors (Auto Pair, Auto List) ---
const pairMap = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`', '$':'$'};
const listMarkers = ['- ', '* ', '+ ']; // Common markdown list markers

/**
 * Handles keydown events in the editor for auto-pairing characters
 * and continuing lists on Enter.
 * @param {KeyboardEvent} event - The keydown event.
 */
function handleEditorKeyDown(event) {
    const key = event.key;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    // --- Auto-Pairing ---
    // If the pressed key is an opening character in our pairMap
    if (Object.keys(pairMap).includes(key)) {
        event.preventDefault(); // Prevent default character insertion
        const selectedText = editor.value.substring(start, end); // Get currently selected text
        const closingChar = pairMap[key]; // Get the corresponding closing character

        // Construct text to insert: opening_char + selected_text + closing_char
        const textToInsert = `${key}${selectedText}${closingChar}`;
        // Insert the text, replacing the selection if any
        editor.setRangeText(textToInsert, start, end, 'end');

        if (selectedText) {
            // If text was selected, re-select it inside the pairs
            editor.setSelectionRange(start + 1, start + 1 + selectedText.length);
        } else {
            // If no text was selected, place cursor between the pairs
            editor.setSelectionRange(start + 1, start + 1);
        }
        updatePreview(); // Update preview
        updateStatusBar(); // Update counts
        return; // Stop further processing for this keydown
    }

    // --- Auto-List Continuation (Enter key) ---
    if (key === 'Enter') {
        // Find the start of the current line
        const currentLineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
        // Get the content of the current line up to the cursor
        const currentLine = editor.value.substring(currenMathJax.typesettLineStart, start);
        const trimmedLine = currentLine.trimStart(); // Line content without leading whitespace

        let listPrefix = null; // Stores the list marker and indentation (e.g., "  - ")
        let isEmptyListItem = false; // Flag if the current list item is empty

        // Check for Unordered List Markers ('-', '*', '+')
        for (const marker of listMarkers) {
            if (trimmedLine.startsWith(marker)) {
                // Get leading whitespace + marker
                listPrefix = currentLine.match(/^\s*/)[0] + marker;
                // Check if the line only contains the marker (and whitespace)
                isEmptyListItem = trimmedLine.length === marker.length;
                break; // Found marker, stop checking
            }
        }

        // Check for Ordered List Markers ('1.', '2.', etc.) if no unordered marker found
        if (!listPrefix) {
            const orderedMatch = trimmedLine.match(/^(\d+)\.\s+/); // Match digits, period, space
            if (orderedMatch) {
                const currentNum = parseInt(orderedMatch[1], 10); // Get current number
                const indentation = currentLine.match(/^\s*/)[0]; // Get leading whitespace
                // Create prefix for the next item, incrementing the number
                listPrefix = `${indentation}${currentNum + 1}. `;
                // Check if the line only contains the marker (e.g., "1. ")
                isEmptyListItem = trimmedLine.length === orderedMatch[0].length;
            }
        }

        // Check for Task List Markers ('- [ ]', '* [x]', etc.) if other lists not found
        if (!listPrefix) {
            // Match '-', '*', or '+' followed by space, '[', space or x, ']', space
            const taskMatch = trimmedLine.match(/^(-|\*|\+)\s+\[( |x)\]\s+/i);
            if(taskMatch){
                const indentation = currentLine.match(/^\s*/)[0]; // Get indentation
                // Create prefix for the next task item (always unchecked)
                listPrefix = `${indentation}${taskMatch[1]} [ ] `; // taskMatch[1] is the list marker '-', '*', or '+'
                // Check if the line only contains the task marker
                isEmptyListItem = trimmedLine.length === taskMatch[0].length;
            }
        }


        // If we found a list marker on the current line
        if (listPrefix) {
            event.preventDefault(); // Prevent default Enter behavior (just inserting newline)

            if (isEmptyListItem) {
                // If the current list item is empty, pressing Enter should remove it
                // and de-indent (effectively ending the list or moving up a level)
                // Select the current list item line (marker + whitespace)
                editor.setSelectionRange(currentLineStart, start);
                // Replace it with an empty string
                editor.setRangeText('', currentLineStart, start, 'end');
                // Insert the newline after the removed list item
                editor.setRangeText('\n', editor.selectionStart, editor.selectionStart, 'end');
                // TODO: De-indentation logic could be added here if needed
            } else {
                // If the current list item is not empty, continue the list
                // Insert a newline followed by the calculated list prefix
                editor.setRangeText(`\n${listPrefix}`, start, end, 'end');
            }

            updatePreview();
            updateStatusBar();
            return; // Stop further processing for Enter key
        }
    }
}

// --- Theme Logic ---

/**
 * Applies the specified theme (light or dark) by adding/removing the 'dark-mode' class to the body.
 * @param {'light' | 'dark'} theme - The theme to apply.
 */
function applyTheme(theme) {
    currentTheme = theme; // Update state variable
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    // Update the --preview-bg-rgb variable used for the search overlay background
    const bodyStyles = getComputedStyle(document.body);
    const previewBg = bodyStyles.getPropertyValue('--preview-bg').trim();
    // This conversion is basic, might fail for complex color values (hsl, etc.)
    // A more robust solution might involve setting --preview-bg-rgb directly in CSS
    try {
        // Simple check for hex/rgb
        if (previewBg.startsWith('#')) {
            const r = parseInt(previewBg.slice(1, 3), 16);
            const g = parseInt(previewBg.slice(3, 5), 16);
            const b = parseInt(previewBg.slice(5, 7), 16);
            document.documentElement.style.setProperty('--preview-bg-rgb', `${r}, ${g}, ${b}`);
        } else if (previewBg.startsWith('rgb')) {
            const rgbValues = previewBg.match(/\d+/g);
            if (rgbValues && rgbValues.length >= 3) {
                document.documentElement.style.setProperty('--preview-bg-rgb', `${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}`);
            }
        } else { // Fallback to default light/dark values
            document.documentElement.style.setProperty('--preview-bg-rgb', theme === 'dark' ? '43, 43, 43' : '255, 255, 255');
        }
    } catch (e) {
        console.error("Error setting preview-bg-rgb:", e);
        document.documentElement.style.setProperty('--preview-bg-rgb', theme === 'dark' ? '43, 43, 43' : '255, 255, 255');
    }
}

/**
 * Toggles the theme between light and dark and saves the preference.
 */
function toggleTheme() {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    saveStateToLocalStorage(); // Persist theme preference
}

// --- Local Database Persistence ---
// similar to local storage, but not automatically synced, requiring manual care.
// here I guess it is bad idea to use async/await here as we change variables without using mutex nor any equivalence, but I have not find any way to fix so let's just leave them here until bug really appears.
async function updateLocalDB() {
    // save current editor.value as content to pouchDB along with the fileNameSpan.textContent as name
    // if fileNameSpan.textContent is untitled, pop out a notification to rename it
    if (fileNameSpan.textContent === "untitled") {
	renameDocQuest();
    }

    // if doc is stored already, we update it, else, we add a new doc
    // note that I store the latest content instead of indexDB cache because that is just a backup for inconsistent modifications.
    try {
	const doc = await db.get(fileNameSpan.textContent);
	const newDoc = {
	    _id: fileNameSpan.textContent,
	    _rev: doc._rev,
	    name: fileNameSpan.textContent,
	    content: editor.value
	}
	await db.put(newDoc);
	console.log('Document updated to ', newDoc);
	confirm('Document has been updated!');
    } catch (err) {
	if (err.name === 'not_found') {
	    const newDoc = {
		_id: fileNameSpan.textContent,
		name: fileNameSpan.textContent,
		content: editor.value
	    };
	    await db.put(newDoc);
	    console.log('Document created as ', newDoc);
	    confirm('Document has been created!');
	} else {
	    console.error('An error occurred while saving the document:', err);
	    alert('error occuring when saving, see console for error.');
	}
    }
}
async function readFromLocalDB() {
    promptResult = prompt("Enter the filename to retrieve from PouchDB");
    if (promptResult != null) {
	try {
	    const doc = await db.get(promptResult);
	    fileNameSpan.textContent = doc.name;
	    editor.value = doc.content;
	    updatePreview(); // we need to mannually update here, as normal update is triggerred by input of the textarea.
	} catch (err) {
	    console.error('An error occurred while opening the document:', err);
	}
    }
}
function pushToRemoteDB() {
    if (remoteDBAddress === "-") {
	changeRemoteDBAddress();
	return;
    }
    
    // below chain call is mostly copied from official pouchdb document
    const rep = db.replicate.to(remoteDBAddress)
	  .on('change', function (info) {
	      // handle change
	  })
	  .on('paused', function (err) {
	      // replication paused (e.g. replication up to date, user went offline)
	  })
	  .on('active', function () {
	      // replicate resumed (e.g. new changes replicating, user went back online)
	  })
	  .on('denied', function (err) {
	      // a document failed to replicate (e.g. due to permissions)
	      console.error(err);
	      alert("push denied");
	  })
	  .on('complete', function (info) {
	      // handle complete
	      console.log(info);
	      confirm("push completed");
	  })
	  .on('error', function (err) {
	      // handle error
	      console.error(err);
	  });
}
function pullFromRemoteDB() {
    if (remoteDBAddress === "-") {
	changeRemoteDBAddress();
	return;
    }
    
    const rep = db.replicate.from(remoteDBAddress)
	  .on('change', function (info) {
	      // handle change
	  })
	  .on('paused', function (err) {
	      // replication paused (e.g. replication up to date, user went offline)
	  })
	  .on('active', function () {
	      // replicate resumed (e.g. new changes replicating, user went back online)
	  })
	  .on('denied', function (err) {
	      // a document failed to replicate (e.g. due to permissions)
	      console.error(err);
	      alert("pull denied");
	  })
	  .on('complete', function (info) {
	      // handle complete
	      console.log(info);
	      confirm("pull completed");
	  })
	  .on('error', function (err) {
	      // handle error
	      console.error(err);
	  });
}

// --- Local Storage Persistence ---
// Key used to store the application state in browser's localStorage
const LS_KEY = 'homeworkMadeEasy_state_v1'; // Increment version if state structure changes significantly

/**
 * Saves the current application state (notes, active note ID, UI settings)
 * to localStorage. Includes current editor content.
 */
function saveStateToLocalStorage() {
    let contentChanged = false;
    if (editor.value != mdContent) {
        mdContent = editor.value;
        contentChanged = true;
    }

    let fileName = fileNameSpan.textContent;
    // Construct the state object to save
    const state = {
	fileName: fileName,
        mdContent: mdContent,
	remoteDBAddress: remoteDBAddress,
        // Persist editor/preview pane split ratio
        editorPanePercent: parseFloat(editorContainer.style.flexBasis) || 50,
        currentTheme: currentTheme // Selected theme
        // activeFilterTag could also be saved if desired
    };

    try {
        // Serialize the state object to JSON and save it
        localStorage.setItem(LS_KEY, JSON.stringify(state));
        // console.log("State saved to localStorage"); // Optional debug log
    } catch (e) {
        // Handle potential errors (e.g., localStorage full)
        console.error("Error saving state to localStorage:", e);
        // Optionally notify the user
        // alert("Warning: Could not save session data. LocalStorage might be full or disabled.");
    }
}

/**
 * Loads the application state from localStorage upon startup.
 * Initializes the editor with the saved state or default values.
 */
function loadStateFromLocalStorage() {
    try {
        const savedState = localStorage.getItem(LS_KEY); // Retrieve saved state string

        if (savedState) {
            const state = JSON.parse(savedState); // Parse the JSON string
	    fileName = state.fileName || "untitled";
	    mdContent = state.mdContent || "";
	    remoteDBAddress = state.remoteDBAddress || "-";
            currentTheme = state.currentTheme || 'dark';
            applyTheme(currentTheme); // Apply the loaded theme

            // Restore editor/preview pane split
            const editorPercent = state.editorPanePercent || 50;
            editorContainer.style.flexBasis = `${editorPercent}%`;
            preview.style.flexBasis = `${100 - editorPercent}%`;

	    remoteDBSpan.textContent = remoteDBAddress;
	    fileNameSpan.textContent = fileName;
            editor.value = mdContent;

            // Perform initial UI rendering based on loaded state
            renderUI();
            updatePreview();
            console.log("Application state loaded from localStorage");

        } else {
            // No saved state found - initialize with defaults
            applyTheme('dark'); // Default to light theme
            // Add a default welcome note for first-time users
            addNote("Welcome to **Homework Made Easy**,  \nthe *ultimate solution* for doing homework everywhere!\n\n- Use the toolbar or Markdown syntax to format text.\n- Your notes are saved automatically in your browser's local storage.\n- math formulas are allowed as well!\n  \n  Like $e^{i\\theta}=\\cos\\theta+i\\sin\\theta$\n");
        }
    } catch (e) {
        console.error("Error loading state from localStorage:", e);
        // Fallback to a clean state in case of error
        applyTheme('dark');
        // Add an error message note
        addNote(`# Error Loading Previous Session\n\nThere was an error loading your saved notes:\n\n\`\`\`\n${e.message}\n\`\`\`\n\nStarting with a fresh session.\n`);
        renderUI();
        updatePreview();
    }
}


// --- Global Keydown Listener for Shortcuts ---

/**
 * Handles global keydown events for application-wide shortcuts (like Ctrl+S, Ctrl+N).
 * @param {KeyboardEvent} event - The keydown event.
 */
function handleGlobalKeyDown(event) {
    // Check if modifier key (Ctrl or Cmd on Mac) is pressed
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? event.metaKey : event.ctrlKey; // Use Meta key (Cmd) on Mac, Ctrl otherwise

    let handled = false; // Flag to check if we handled the event

    if (modKey) {
        switch (event.key.toLowerCase()) {
        case 'b': // Ctrl+B or Cmd+B (Bold)
            // Only apply formatting if the editor has focus
            if (document.activeElement === editor) {
                applyMarkdownFormatting('**');
                handled = true;
            }
            break;
        case 'i': // Ctrl+I or Cmd+I (Italic)
            if (document.activeElement === editor) {
                applyMarkdownFormatting('*');
                handled = true;
            }
            break;
            // Add more shortcuts as needed (e.g., Ctrl+Shift+S for Save As - not implemented)
        }
    }

    // If we handled the event, prevent default browser behavior (e.g., browser save dialog on Ctrl+S)
    if (handled) {event.preventDefault();}
}

// --- Export Options ---

/**
 * export to different formats
 * currently only supports PDF
 */
function downloadAsPDF(event) {
    MathJax.typeset(); // Is this obsolote? I don't know!
    var element = document.getElementById('preview');
    html2pdf(element);
}

// --- Event Listeners Setup ---
// Assign functions to UI element events

// Editor Events
remoteDBSpan.addEventListener('click', changeRemoteDBAddress);
fileNameSpan.addEventListener('click', renameDocQuest);

editor.addEventListener('input', () => { // Fired when content changes
    updatePreview(); // Update Markdown preview
    updateStatusBar(); // Update word/char counts
    // Debounced auto-save to localStorage after a short delay of inactivity
    clearTimeout(autoSaveTimer); // Clear previous timer
    autoSaveTimer = setTimeout(() => {
        saveStateToLocalStorage();
        console.log("Auto-saved state to localStorage."); // Optional log
    }, 2000); // Auto-save after 2 seconds of inactivity
});
editor.addEventListener('keydown', handleEditorKeyDown); // Handle auto-pair, auto-list, etc.

// Editor Toolbar Button Clicks (delegated to the toolbar element)
editorToolbar.addEventListener('click', (e) => {
    const target = e.target;
    // Check if the clicked element is a button inside the toolbar
    if (target.tagName === 'BUTTON' && target.closest('#editorToolbar')) {
        // Call formatting function based on button ID
        switch (target.id) {
        case 'toolbarH1': applyMarkdownFormatting('# ', '', 'Heading 1', true); break;
        case 'toolbarH2': applyMarkdownFormatting('## ', '', 'Heading 2', true); break;
        case 'toolbarH3': applyMarkdownFormatting('### ', '', 'Heading 3', true); break;
        case 'toolbarBold': applyMarkdownFormatting('**'); break;
        case 'toolbarItalic': applyMarkdownFormatting('*'); break;
        case 'toolbarBlockquote': applyMarkdownFormatting('> ', '', 'Quote text', true); break;
        case 'toolbarLink': applyMarkdownFormatting('[', '](url)', 'link text'); break;
        case 'toolbarCode': applyMarkdownFormatting('`'); break;
        case 'toolbarListUl': applyMarkdownFormatting('- ', '', 'List item', true); break;
        case 'toolbarListOl': applyMarkdownFormatting('1. ', '', 'List item', true); break;
        case 'toolbarTaskList': applyMarkdownFormatting('- [ ] ', '', 'Task item', true); break;
        case 'toolbarHr': applyMarkdownFormatting('---', '', '', true); break;
        }
    }
});

// Theme Toggle Button (in controls)
themeToggleBtn.addEventListener('click', toggleTheme);

// Preview Toggle Button (in controls)
previewBtn.addEventListener('click', togglePreview);

// Export (to PDF) Button (in controls)
exportPDF.addEventListener('click', downloadAsPDF);

// PouchDB/CouchDB interaction button (in controls)
saveFileAs.addEventListener('click', updateLocalDB);
openFileAs.addEventListener('click', readFromLocalDB);
syncFromRemote.addEventListener('click', pushToRemoteDB);
syncToRemote.addEventListener('click', pullFromRemoteDB);

// Window Events
window.addEventListener('beforeunload', (event) => {
    // Ensure latest state is saved before potentially showing the prompt
    if (mdContent != "") {
        clearTimeout(autoSaveTimer); // Cancel any pending auto-save
        saveStateToLocalStorage(); // Save final state
    }
});

// Global Keydown Listener for Shortcuts
document.addEventListener('keydown', handleGlobalKeyDown);


// --- Initial Setup ---
// Load previous state from localStorage when the application starts
loadStateFromLocalStorage();

// Initial UI rendering and preview update happens inside loadStateFromLocalStorage
// or its fallback initial note creation.

// Ensure the theme is applied correctly based on the loaded state
// (applyTheme is called within loadStateFromLocalStorage)

console.log("Homework Made Easy Initialized.");
