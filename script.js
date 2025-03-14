$(document).ready(function() {
    // Global variables
    let notes = [];
    let currentNote = null;
    let isModified = false;
    let undoStack = [];
    let redoStack = [];
    let selectedChar = null;
    
    // Load saved notes from localStorage
    function loadNotes() {
        const savedNotes = localStorage.getItem('notepad_notes');
        if (savedNotes) {
            notes = JSON.parse(savedNotes);
            renderNotesList();
        }
    }
    
    // Save notes to localStorage
    function saveNotes() {
        localStorage.setItem('notepad_notes', JSON.stringify(notes));
    }
    
    // Render the notes list in sidebar
    function renderNotesList() {
        const $notesList = $('.notes');
        $notesList.empty();
        
        if (notes.length === 0) {
            $notesList.append('<li class="empty-note">No notes yet</li>');
            return;
        }
        
        // Sort notes based on current sorting
        const sortMode = localStorage.getItem('notepad_sort') || 'creation';
        
        if (sortMode === 'alpha') {
            notes.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortMode === 'modified') {
            notes.sort((a, b) => b.modified - a.modified);
        } else {
            notes.sort((a, b) => b.created - a.created);
        }
        
        // Update sort indicators
        $('#sortAZ i').removeClass('i-check').addClass('');
        $('#sortNone i').removeClass('i-check').addClass('');
        $('#sortDate i').removeClass('i-check').addClass('');
        
        if (sortMode === 'alpha') {
            $('#sortAZ i').removeClass('').addClass('i-check');
        } else if (sortMode === 'modified') {
            $('#sortDate i').removeClass('').addClass('i-check');
        } else {
            $('#sortNone i').removeClass('').addClass('i-check');
        }
        
        // Get view mode
        const viewMode = localStorage.getItem('notepad_view') || 'detailed';
        
        // Update view indicators
        $('#view_compact i').removeClass('i-check').addClass('');
        $('#view_all i').removeClass('i-check').addClass('');
        
        if (viewMode === 'compact') {
            $('#view_compact i').removeClass('').addClass('i-check');
        } else {
            $('#view_all i').removeClass('').addClass('i-check');
        }
        
        // Render each note
        notes.forEach(note => {
            let noteHTML = '';
            
            if (viewMode === 'compact') {
                noteHTML = `<li data-id="${note.id}" class="${currentNote && currentNote.id === note.id ? 'active' : ''}">
                    <strong>${note.title || 'Untitled Note'}</strong>
                </li>`;
            } else {
                const date = new Date(note.modified);
                const dateString = date.toLocaleDateString();
                const preview = note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '');
                
                noteHTML = `<li data-id="${note.id}" class="${currentNote && currentNote.id === note.id ? 'active' : ''}">
                    <strong>${note.title || 'Untitled Note'}</strong>
                    <div class="note-date">${dateString}</div>
                    <div class="note-preview">${preview}</div>
                </li>`;
            }
            
            $notesList.append(noteHTML);
        });
    }
    
    // Create a new note
    function createNewNote() {
        saveCurrentNoteIfNeeded();
        
        const newNote = {
            id: Date.now(),
            title: '',
            content: '',
            created: Date.now(),
            modified: Date.now()
        };
        
        notes.unshift(newNote);
        currentNote = newNote;
        
        $('#n_title').val('');
        $('#n_text').val('');
        
        renderNotesList();
        saveNotes();
        updateWordCount();
        clearUndoRedo();
    }
    
    // Load a note into the editor
    function loadNote(noteId) {
        saveCurrentNoteIfNeeded();
        
        const note = notes.find(n => n.id === noteId);
        if (note) {
            currentNote = note;
            $('#n_title').val(note.title);
            $('#n_text').val(note.content);
            renderNotesList();
            updateWordCount();
            clearUndoRedo();
            pushToUndoStack();
        }
    }
    
    // Save the current note
    function saveCurrentNote() {
        if (currentNote) {
            currentNote.title = $('#n_title').val() || 'Untitled Note';
            currentNote.content = $('#n_text').val();
            currentNote.modified = Date.now();
            
            saveNotes();
            renderNotesList();
            isModified = false;
            
            showToast('Note saved');
        }
    }
    
    // Save current note if it has been modified
    function saveCurrentNoteIfNeeded() {
        if (currentNote && isModified) {
            saveCurrentNote();
        }
    }
    
    // Delete the current note
    function deleteCurrentNote() {
        if (currentNote) {
            showConfirm('Delete note', 'Are you sure you want to delete this note?', 'Delete', 'Cancel', function() {
                const index = notes.findIndex(n => n.id === currentNote.id);
                if (index !== -1) {
                    notes.splice(index, 1);
                    saveNotes();
                    
                    if (notes.length > 0) {
                        loadNote(notes[0].id);
                    } else {
                        currentNote = null;
                        $('#n_title').val('');
                        $('#n_text').val('');
                        updateWordCount();
                    }
                    
                    renderNotesList();
                }
            });
        }
    }
    
    // Update word count in the status bar
    function updateWordCount() {
        const text = $('#n_text').val() || '';
        const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        $('#wordsNum').text(`Words: ${wordCount}`);
        
        // Update caret position
        updateCaretPosition();
    }
    
    // Update caret position in the status bar
    function updateCaretPosition() {
        const textarea = document.getElementById('n_text');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        if (start === end) {
            const text = textarea.value.substring(0, start);
            const lines = text.split('\n');
            const line = lines.length;
            const col = lines[lines.length - 1].length + 1;
            
            $('#caretPos').text(`Ln ${line}, Col ${col}`);
        } else {
            $('#caretPos').text(`Selected ${end - start} character(s)`);
        }
    }
    
    // Undo/Redo functions
    function pushToUndoStack() {
        if (!currentNote) return;
        
        const state = {
            title: $('#n_title').val(),
            content: $('#n_text').val()
        };
        
        undoStack.push(state);
        
        // Limit stack size
        if (undoStack.length > 100) {
            undoStack.shift();
        }
        
        // Clear redo stack on new changes
        redoStack = [];
    }
    
    function undo() {
        if (undoStack.length <= 1) return;
        
        // Save the current state to redo stack
        const currentState = {
            title: $('#n_title').val(),
            content: $('#n_text').val()
        };
        
        redoStack.push(currentState);
        
        // Remove the current state from undo stack
        undoStack.pop();
        
        // Apply the previous state
        const prevState = undoStack[undoStack.length - 1];
        $('#n_title').val(prevState.title);
        $('#n_text').val(prevState.content);
        
        updateWordCount();
        isModified = true;
    }
    
    function redo() {
        if (redoStack.length === 0) return;
        
        // Get the state from redo stack
        const nextState = redoStack.pop();
        
        // Save current state to undo stack
        const currentState = {
            title: $('#n_title').val(),
            content: $('#n_text').val()
        };
        
        undoStack.push(currentState);
        
        // Apply the next state
        $('#n_title').val(nextState.title);
        $('#n_text').val(nextState.content);
        
        updateWordCount();
        isModified = true;
    }
    
    function clearUndoRedo() {
        undoStack = [];
        redoStack = [];
        
        // Add initial state
        pushToUndoStack();
    }
    
    // Find and replace
    function findAndReplace() {
        const findText = $('#find_box').val();
        const replaceText = $('#replace_box').val();
        
        if (!findText) {
            showToast('Please enter text to find');
            return;
        }
        
        const text = $('#n_text').val();
        const matchCase = $('#match_case').prop('checked');
        const wholeWords = $('#whole_words').prop('checked');
        
        let searchRegexp;
        
        if (wholeWords) {
            searchRegexp = new RegExp('\\b' + escapeRegExp(findText) + '\\b', matchCase ? 'g' : 'gi');
        } else {
            searchRegexp = new RegExp(escapeRegExp(findText), matchCase ? 'g' : 'gi');
        }
        
        const newText = text.replace(searchRegexp, replaceText);
        
        if (text === newText) {
            showToast('No matches found');
            return;
        }
        
        $('#n_text').val(newText);
        isModified = true;
        pushToUndoStack();
        updateWordCount();
        
        showToast('Replacement complete');
        $('#find_replace').hide();
    }
    
    // Helper function to escape special characters in regex
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    // Insert date/time
    function insertDateTime() {
        const now = new Date();
        const dateTimeString = now.toLocaleString();
        
        insertTextAtCursor(dateTimeString);
    }
    
    // Insert text at cursor position
    function insertTextAtCursor(text) {
        const textarea = document.getElementById('n_text');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        
        textarea.value = before + text + after;
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
        
        isModified = true;
        pushToUndoStack();
        updateWordCount();
    }
    
    // Cut, copy, delete selected text
    function cutText() {
        document.execCommand('cut');
        isModified = true;
        pushToUndoStack();
        updateWordCount();
    }
    
    function copyText() {
        document.execCommand('copy');
    }
    
    function deleteSelectedText() {
        const textarea = document.getElementById('n_text');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        if (start !== end) {
            const before = textarea.value.substring(0, start);
            const after = textarea.value.substring(end);
            
            textarea.value = before + after;
            textarea.selectionStart = textarea.selectionEnd = start;
            textarea.focus();
            
            isModified = true;
            pushToUndoStack();
            updateWordCount();
        }
    }
    
    // Download the current note as a text file
    function downloadNote() {
        if (!currentNote) return;
        
        const title = $('#n_title').val() || 'Untitled Note';
        const content = $('#n_text').val();
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        
        link.href = URL.createObjectURL(blob);
        link.download = `${title}.txt`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // Print the current note
    function printNote() {
        if (!currentNote) return;
        
        const title = $('#n_title').val() || 'Untitled Note';
        const content = $('#n_text').val();
        
        $('#print').html(`<h1>${title}</h1><pre>${content}</pre>`);
        window.print();
    }
    
    // Open a text file
    function openFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            createNewNote();
            $('#n_title').val(file.name.replace(/\.txt$/, ''));
            $('#n_text').val(e.target.result);
            saveCurrentNote();
            updateWordCount();
            pushToUndoStack();
        };
        
        reader.readAsText(file);
    }
    
    // Toggle fullscreen mode
    function toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            $('#winSize').removeClass('i-fullscreen_exit').addClass('i-fullscreen');
            $('#winCheck').removeClass('i-check');
        } else {
            document.documentElement.requestFullscreen();
            $('#winSize').removeClass('i-fullscreen').addClass('i-fullscreen_exit');
            $('#winCheck').addClass('i-check');
        }
    }
    
    // Toggle word wrap
    function toggleWordWrap() {
        const isWrapped = $('#n_text').css('white-space') !== 'nowrap';
        
        if (isWrapped) {
            $('#n_text').css('white-space', 'nowrap');
            $('#isWrap i').removeClass('i-check');
        } else {
            $('#n_text').css('white-space', 'pre-wrap');
            $('#isWrap i').addClass('i-check');
        }
        
        localStorage.setItem('notepad_wrap', !isWrapped);
    }
    
    // Toggle spellcheck
    function toggleSpellcheck() {
        const isSpellcheck = $('#n_text').attr('spellcheck') === 'true';
        
        if (isSpellcheck) {
            $('#n_text').attr('spellcheck', 'false');
            $('#isSpell i').removeClass('i-check');
        } else {
            $('#n_text').attr('spellcheck', 'true');
            $('#isSpell i').addClass('i-check');
        }
        
        localStorage.setItem('notepad_spell', !isSpellcheck);
    }
    
    // Toggle status bar
    function toggleStatusBar() {
        const isVisible = $('.editor-footer').is(':visible');
        
        if (isVisible) {
            $('.editor-footer').hide();
            $('#isStatus i').removeClass('i-check');
        } else {
            $('.editor-footer').show();
            $('#isStatus i').addClass('i-check');
        }
        
        localStorage.setItem('notepad_status', !isVisible);
    }
    
    // Update font settings
    function updateFontSettings() {
        const fontFamily = $('#font_family').val();
        const fontSize = $('#font_size').val();
        const fontWeight = $('#font_weight').val();
        const fontStyle = $('#font_style').val().toLowerCase();
        const lineHeight = $('#font_line').val();
        
        $('#n_text').css({
            'font-family': fontFamily,
            'font-size': fontSize,
            'font-weight': fontWeight,
            'font-style': fontStyle,
            'line-height': lineHeight
        });
        
        localStorage.setItem('notepad_font', JSON.stringify({
            family: fontFamily,
            size: fontSize,
            weight: fontWeight,
            style: fontStyle,
            line: lineHeight
        }));
        
        $('#font_format').hide();
    }
    
    // Reset font settings
    function resetFontSettings() {
        $('#font_family').val('inherit');
        $('#font_size').val('11pt');
        $('#font_weight').val('400');
        $('#font_style').val('Normal');
        $('#font_line').val('1.8');
        
        updateFontSettings();
    }
    
    // Load font settings from localStorage
    function loadFontSettings() {
        const fontSettings = localStorage.getItem('notepad_font');
        
        if (fontSettings) {
            const settings = JSON.parse(fontSettings);
            
            $('#font_family').val(settings.family);
            $('#font_size').val(settings.size);
            $('#font_weight').val(settings.weight);
            $('#font_style').val(settings.style.charAt(0).toUpperCase() + settings.style.slice(1));
            $('#font_line').val(settings.line);
            
            $('#n_text').css({
                'font-family': settings.family,
                'font-size': settings.size,
                'font-weight': settings.weight,
                'font-style': settings.style,
                'line-height': settings.line
            });
        }
    }
    
    // Show/hide modals
    function showModal(modalId) {
        $('.modal').hide();
        $(modalId).show();
        $('.mask').show();
    }
    
    // Show confirmation dialog
    function showConfirm(title, message, confirmText, cancelText, callback) {
        $('#confirm .modal-head b').text(title);
        $('#confirm .modal-body p').text(message);
        $('#confirm .confirm-1').text(confirmText);
        $('#confirm .confirm-2').text(cancelText);
        
        $('#confirm').show();
        $('.mask').show();
        
        $('#confirm .confirm-1').off('click').on('click', function() {
            $('#confirm').hide();
            $('.mask').hide();
            if (callback) callback();
        });
        
        $('#confirm .confirm-2, #confirm .modal-x').off('click').on('click', function() {
            $('#confirm').hide();
            $('.mask').hide();
        });
    }
    
    // Show toast notification
    function showToast(message) {
        $('.toast-content').text(message);
        $('.toast').fadeIn(300);
        
        setTimeout(function() {
            $('.toast').fadeOut(300);
        }, 2000);
    }
    
    // Toggle mobile sidebar
    function toggleSidebar() {
        $('.sidebar').toggleClass('open');
        $('.mob-mask').toggle();
    }
    
    // Export notes (backup)
    function exportNotes() {
        const exportData = JSON.stringify(notes);
        const blob = new Blob([exportData], { type: 'application/json' });
        const link = document.createElement('a');
        
        link.href = URL.createObjectURL(blob);
        link.download = 'notepad_backup.json';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Backup saved');
    }
    
    // Clear all notes
    function clearAllNotes() {
        showConfirm('Clear all notes', 'Are you sure you want to delete all notes? This cannot be undone.', 'Delete All', 'Cancel', function() {
            notes = [];
            currentNote = null;
            $('#n_title').val('');
            $('#n_text').val('');
            saveNotes();
            renderNotesList();
            updateWordCount();
            clearUndoRedo();
            showToast('All notes cleared');
        });
    }
    
    // Change sort mode
    function changeSortMode(mode) {
        localStorage.setItem('notepad_sort', mode);
        renderNotesList();
    }
    
    // Change view mode
    function changeViewMode(mode) {
        localStorage.setItem('notepad_view', mode);
        renderNotesList();
    }
    
    // Search notes
    function searchNotes() {
        const query = $('#n_search').val().toLowerCase();
        
        if (!query) {
            renderNotesList();
            return;
        }
        
        const $notesList = $('.notes');
        $notesList.empty();
        
        const matchedNotes = notes.filter(note => 
            note.title.toLowerCase().includes(query) || 
            note.content.toLowerCase().includes(query)
        );
        
        if (matchedNotes.length === 0) {
            $notesList.append('<li class="empty-note">No matching notes found</li>');
            return;
        }
        
        matchedNotes.forEach(note => {
            const date = new Date(note.modified);
            const dateString = date.toLocaleDateString();
            const preview = note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '');
            
            const noteHTML = `<li data-id="${note.id}" class="${currentNote && currentNote.id === note.id ? 'active' : ''}">
                <strong>${note.title || 'Untitled Note'}</strong>
                <div class="note-date">${dateString}</div>
                <div class="note-preview">${preview}</div>
            </li>`;
            
            $notesList.append(noteHTML);
        });
    }
    
    // Initialize the app
    function init() {
        loadNotes();
        loadFontSettings();
        
        // Load preferences
        if (localStorage.getItem('notepad_wrap') === 'true') {
            $('#n_text').css('white-space', 'pre-wrap');
            $('#isWrap i').addClass('i-check');
        } else {
            $('#n_text').css('white-space', 'nowrap');
            $('#isWrap i').removeClass('i-check');
        }
        
        if (localStorage.getItem('notepad_spell') === 'false') {
            $('#n_text').attr('spellcheck', 'false');
            $('#isSpell i').removeClass('i-check');
        } else {
            $('#n_text').attr('spellcheck', 'true');
            $('#isSpell i').addClass('i-check');
        }
        
        if (localStorage.getItem('notepad_status') === 'false') {
            $('.editor-footer').hide();
            $('#isStatus i').removeClass('i-check');
        } else {
            $('.editor-footer').show();
            $('#isStatus i').addClass('i-check');
        }
        
        // Create first note if none exist
        if (notes.length === 0) {
            createNewNote();
        } else {
            // Load the most recent note
            loadNote(notes[0].id);
        }
        
        // Setup event listeners
        setupEventListeners();
    }
    
    // Setup all event listeners
    function setupEventListeners() {
        // Sidebar buttons
        $('#new_btn').on('click', createNewNote);
        
        $('.notes').on('click', 'li', function() {
            const noteId = parseInt($(this).attr('data-id'));
            loadNote(noteId);
        });
        
        $('#n_search').on('input', searchNotes);
        
        // Sort options
        $('#sortAZ').on('click', function(e) {
            e.preventDefault();
            changeSortMode('alpha');
        });
        
        $('#sortNone').on('click', function(e) {
            e.preventDefault();
            changeSortMode('creation');
        });
        
        $('#sortDate').on('click', function(e) {
            e.preventDefault();
            changeSortMode('modified');
        });
        
        // View options
        $('#view_compact').on('click', function(e) {
            e.preventDefault();
            changeViewMode('compact');
        });
        
        $('#view_all').on('click', function(e) {
            e.preventDefault();
            changeViewMode('detailed');
        });
        
        // Backup and clear
        $('#backup_btn').on('click', function(e) {
            e.preventDefault();
            exportNotes();
        });
        
        $('#clear_btn').on('click', function(e) {
            e.preventDefault();
            clearAllNotes();
        });
        
        // Editor events
        $('#n_title').on('input', function() {
            isModified = true;
        });
        
        $('#n_text').on('input', function() {
            isModified = true;
            updateWordCount();
            pushToUndoStack();
        });
        
        $('#n_text').on('keyup mouseup', updateCaretPosition);
        
        // Delete note
        $('#del_btn').on('click', function(e) {
            e.preventDefault();
            deleteCurrentNote();
        });
        
        // File menu
        $('#file_new').on('click', function(e) {
            e.preventDefault();
            createNewNote();
        });
        
        $('#file_open').on('change', openFile);
        
        $('#file_save').on('click', function(e) {
            e.preventDefault();
            saveCurrentNote();
        });
        
        $('#file_download').on('click', function(e) {
            e.preventDefault();
            downloadNote();
        });
        
        $('#file_print').on('click', function(e) {
            e.preventDefault();
            printNote();
        });
        
        // Edit menu
        $('#edit_undo').on('click', function(e) {
            e.preventDefault();
            undo();
        });
        
        $('#edit_redo').on('click', function(e) {
            e.preventDefault();
            redo();
        });
        
        $('#edit_cut').on('click', function(e) {
            e.preventDefault();
            cutText();
        });
        
        $('#edit_copy').on('click', function(e) {
            e.preventDefault();
            copyText();
        });
        
        $('#edit_del').on('click', function(e) {
            e.preventDefault();
            deleteSelectedText();
        });
        
        $('#edit_sel').on('click', function(e) {
            e.preventDefault();
            $('#n_text').select();
        });
        
        $('#edit_fnr').on('click', function(e) {
            e.preventDefault();
            showModal('#find_replace');
        });
        
        // Find and replace modal
        $('#replaceall_btn').on('click', function() {
            findAndReplace();
        });
        
        // Insert menu
        $('#ins_time').on('click', function(e) {
            e.preventDefault();
            insertDateTime();
        });
        
        $('#ins_char').on('click', function(e) {
            e.preventDefault();
            showModal('#char_list');
        });
        
        $('#ins_emo').on('click', function(e) {
            e.preventDefault();
            showModal('#emoji_list');
        });
        
        // Character and emoji insertion
        $('.charlist li').on('click', function() {
            selectedChar = $(this).text();
            $(this).addClass('selected').siblings().removeClass('selected');
        });
        
        $('.charlist li').on('dblclick', function() {
            insertTextAtCursor($(this).text());
            $('.modal').hide();
            $('.mask').hide();
        });
        
        $('.ins_char_btn').on('click', function() {
            if (selectedChar) {
                insertTextAtCursor(selectedChar);
                $('.modal').hide();
                $('.mask').hide();
                selectedChar = null;
            } else {
                showToast('Please select a character');
            }
        });
        
        // Format menu
        $('#isWrap').on('click', function(e) {
            e.preventDefault();
            toggleWordWrap();
        });
        
        $('#font_btn').on('click', function(e) {
            e.preventDefault();
            showModal('#font_format');
        });
        
        // Font settings
        $('#font_family, #font_size, #font_weight, #font_style, #font_line').on('change', updateFontSettings);
        
        $('#reset_font').on('click', resetFontSettings);
        
        // Tools menu
        $('#isSpell').on('click', function(e) {
            e.preventDefault();
            toggleSpellcheck();
        });
        
        // View menu
        $('#isStatus').on('click', function(e) {
            e.preventDefault();
            toggleStatusBar();
        });
        
        $('.fullscreen_btn').on('click', function(e) {
            e.preventDefault();
            toggleFullscreen();
        });
        
        // Help menu
        $('#about_btn').on('click', function(e) {
            e.preventDefault();
            showModal('#about_app');
        });
        
        // Close modals
        $('.modal-x').on('click', function() {
            $(this).closest('.modal').hide();
            $('.mask').hide();
        });
        
        $('.mask').on('click', function() {
            $('.modal').hide();
            $('.mask').hide();
        });
        
        // Mobile nav
        $('#nav-btn').on('click', function(e) {
            e.preventDefault();
            toggleSidebar();
        });
        
        $('.mob-mask').on('click', function() {
            toggleSidebar();
        });
        
        // Handle beforeunload to warn about unsaved changes
        $(window).on('beforeunload', function() {
            if (isModified) {
                return 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
        
        // Auto-save every minute
        setInterval(function() {
            if (isModified) {
                saveCurrentNote();
            }
        }, 60000);
    }
    
    // Start the app
    init();
});

