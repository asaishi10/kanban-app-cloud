import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2, AlertCircle, LogOut, Calendar, Clock, PenTool, Menu, GripVertical, ZoomIn, ZoomOut, Target, BookOpen, ExternalLink, Bold, Underline, Palette } from 'lucide-react';

// --- Firebase のインポート ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

let firebaseConfig = {
  apiKey: "AIzaSyCqTZxvNFGf0O4_DDa7JQ45Zd8hxYKqYHY",
  authDomain: "kanban-cloud-app.firebaseapp.com",
  projectId: "kanban-cloud-app",
  storageBucket: "kanban-cloud-app.firebasestorage.app",
  messagingSenderId: "584318556014",
  appId: "1:584318556014:web:426b5fbfb962b730a7137f"
};

try {
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.error("Firebase config parsing error", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'kanban-cloud-app';
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

const app = isConfigValid ? initializeApp(firebaseConfig) : null;
const auth = isConfigValid ? getAuth(app) : null;
const provider = new GoogleAuthProvider();
const db = isConfigValid ? getFirestore(app) : null;

const generateId = () => Math.random().toString(36).substr(2, 9);

// 画像圧縮処理
const compressImage = (dataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
};

// ★ HTML内のテキストノードを検索し、URLと辞書ワードを安全に自動リンク化する関数
const applyDictionaryLinks = (htmlString, links, categoryId) => {
  if (!htmlString) return '';
  const validLinks = (links || []).filter(l => l && typeof l.word === 'string' && l.word.trim() !== '' && (!l.groupName || l.groupName === 'すべて' || l.groupName === categoryId));
  validLinks.sort((a, b) => (b.word?.length || 0) - (a.word?.length || 0));
  
  if (validLinks.length === 0 && !htmlString.includes('http')) return htmlString;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const urlRegex = /(https?:\/\/[^\s<]+)/g;

    const walk = (node) => {
      if (node.nodeType === 3) { // Text node
        let text = node.nodeValue;
        let replaced = false;

        if (urlRegex.test(text)) {
           text = text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[#00CC5B] hover:text-[#00AC4C] hover:underline font-bold break-words inline-block" onclick="event.stopPropagation()">$1</a>');
           replaced = true;
        }

        validLinks.forEach(link => {
          const escapedWord = link.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedWord})`, 'g');
          if (regex.test(text)) {
            text = text.replace(regex, `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="text-[#00CC5B] hover:text-[#00AC4C] hover:underline font-bold border-b-[2px] border-dotted border-[#00CC5B] inline-block" onclick="event.stopPropagation()">$1</a>`);
            replaced = true;
          }
        });

        if (replaced) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = text;
          while (tempDiv.firstChild) {
            node.parentNode.insertBefore(tempDiv.firstChild, node);
          }
          node.parentNode.removeChild(node);
        }
      } else if (node.nodeType === 1 && node.nodeName !== 'A') {
        Array.from(node.childNodes).forEach(walk);
      }
    };
    Array.from(doc.body.childNodes).forEach(walk);
    return doc.body.innerHTML;
  } catch (e) {
    return htmlString;
  }
};

// ★ WYSIWYG エディタブロック（編集中も色が変わる！）
const ContentEditableBlock = ({ html, onChange, onKeyDown, onPaste, className, placeholder, id }) => {
  const ref = useRef(null);

  useEffect(() => {
    // フォーカスが当たっていない、かつ内容が異なる場合のみDOMを更新（カーソル飛び防止）
    if (ref.current && html !== ref.current.innerHTML && document.activeElement !== ref.current) {
      ref.current.innerHTML = html || '';
    }
    // 初期マウント時のセット
    if (ref.current && ref.current.innerHTML === '' && html) {
      ref.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div
      id={id}
      ref={ref}
      contentEditable
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={`outline-none min-h-[28px] break-words cursor-text empty:before:content-[attr(data-placeholder)] empty:before:text-[#C4C4C4] empty:before:italic ${className}`}
      data-placeholder={placeholder}
    />
  );
};

const formatDueDate = (dateString) => {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  const isPast = d < new Date();
  const text = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return { text, isPast };
};

const getDueDateParts = (isoString) => {
  if (!isoString) return { date: '', hour: '12', minute: '00' };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { date: '', hour: '12', minute: '00' };
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hour: String(d.getHours()).padStart(2, '0'),
    minute: String(d.getMinutes()).padStart(2, '0')
  };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCategoryEditMode, setIsCategoryEditMode] = useState(false);
  
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('all_list');
  const [notes, setNotes] = useState([]);
  const [links, setLinks] = useState([]);
  
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [allListSortConfig, setAllListSortConfig] = useState({ key: 'dueDate', direction: 'asc' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [], dueDate: '', x: 0, y: 0 });
  const fileInputRef = useRef(null);

  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
  const [dragOverIndicator, setDragOverIndicator] = useState(null);

  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [categoryDragOverIndicator, setCategoryDragOverIndicator] = useState(null);

  // ツールバーの開閉管理State (デフォルトで開く)
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);

  // リンク集用 State
  const [linkFilter, setLinkFilter] = useState('すべて');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkFormData, setLinkFormData] = useState({ id: '', word: '', url: '', groupName: 'すべて' });
  const [draggedLinkId, setDraggedLinkId] = useState(null);
  const [linkDragOverIndicator, setLinkDragOverIndicator] = useState(null);

  // 確認ダイアログ用 State
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: '', targetId: null, actionType: null });

  // フリーノート用 State
  const freenoteRef = useRef(null);
  const [canvasDragState, setCanvasDragState] = useState(null);
  const [freenoteZoom, setFreenoteZoom] = useState(1);

  // ゼロクラッシュ保護用安全変数
  const safeCategories = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const safeNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];
  const safeLinks = Array.isArray(links) ? links.filter(Boolean) : [];

  const dueDateParts = getDueDateParts(formData.dueDate);
  const handleDateChange = (type, val) => {
    const newDateStr = type === 'date' ? val : (dueDateParts.date || new Date().toISOString().split('T')[0]);
    const newHour = type === 'hour' ? val : dueDateParts.hour;
    const newMinute = '00';
    if (newDateStr) {
      const dt = new Date(`${newDateStr}T${newHour}:${newMinute}:00`);
      if (!isNaN(dt.getTime())) setFormData({...formData, dueDate: dt.toISOString()});
    }
  };

  // フリーノートの初期表示を左上に確実に設定する
  useEffect(() => {
    if (activeCategoryId === 'freenote') {
      setTimeout(() => {
        if (freenoteRef.current) {
          freenoteRef.current.scrollTop = 0;
          freenoteRef.current.scrollLeft = 0;
        }
      }, 50);
    }
  }, [activeCategoryId]);

  useEffect(() => {
    if (!isConfigValid) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("ログインに失敗しました。");
      setLoading(false);
    }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch (e) {} };

  useEffect(() => {
    if (!user || !isConfigValid) { setCategories([]); setNotes([]); setLinks([]); return; }
    
    const categoriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'categories');
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const linksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'links');
    
    let isInitialLoad = true;

    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const loadedCategories = snapshot.docs.map(d => {
        const data = d.data();
        if (data && !data.id) data.id = d.id;
        return data;
      }).filter(Boolean).sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : a.createdAt;
        const orderB = b.order !== undefined ? b.order : b.createdAt;
        return (orderA || 0) - (orderB || 0);
      });
      if (loadedCategories.length === 0 && isInitialLoad) {
        const defaultId = generateId();
        const now = Date.now();
        setDoc(doc(categoriesRef, defaultId), { id: defaultId, name: 'メインボード', createdAt: now, order: now });
      } else {
        setCategories(loadedCategories);
      }
      isInitialLoad = false;
    });

    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      const loadedNotes = snapshot.docs.map(d => {
        const data = d.data();
        if (data && !data.id) data.id = d.id;
        return data;
      });
      setNotes(loadedNotes.filter(Boolean));
      setLoading(false);
    });

    const unsubLinks = onSnapshot(linksRef, (snapshot) => {
      const loadedLinks = snapshot.docs.map(d => {
        const data = d.data();
        if (data && !data.id) data.id = d.id;
        return data;
      });
      setLinks(loadedLinks.filter(Boolean));
    });

    return () => { unsubCategories(); unsubNotes(); unsubLinks(); };
  }, [user]);

  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);
  const getLinkDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'links', id);

  const handleTabClick = (categoryId) => {
    setActiveCategoryId(categoryId);
    setIsSidebarOpen(false); // タブクリック時にサイドバーを閉じる
  };

  const handleAddCategory = async () => {
    if (!user) return;
    const newId = generateId();
    const now = Date.now();
    const newCategory = { id: newId, name: '新しいボード', createdAt: now, order: now };
    await setDoc(getCategoryDoc(newId), newCategory);
    handleTabClick(newId);
    setEditingCategoryId(newId);
    setEditingCategoryName(newCategory.name);
    setIsCategoryEditMode(true);
  };

  const saveCategoryName = async (id) => {
    if (!user || editingCategoryName.trim() === '') return;
    await setDoc(getCategoryDoc(id), { name: editingCategoryName.trim() }, { merge: true });
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = async (id) => {
    if (!user || safeCategories.length <= 1) return;
    await deleteDoc(getCategoryDoc(id));
    if (activeCategoryId === id) {
      setActiveCategoryId('all_list');
    }
  };

  const openAddModal = () => {
    setEditingNote(null);
    const initialCategory = (activeCategoryId === 'freenote' || activeCategoryId === 'deadline' || activeCategoryId === 'linkbook' || activeCategoryId === 'all_list') ? (safeCategories[0]?.id || 'freenote') : activeCategoryId;
    setFormData({ title: '', categoryId: initialCategory, blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (note) => {
    if (!note) return;
    setEditingNote(note);
    
    let initialBlocks = [];
    if (Array.isArray(note.blocks)) {
      initialBlocks = note.blocks.map(b => {
        if (typeof b === 'string') return { id: generateId(), type: 'text', content: b, checked: false };
        if (b && typeof b === 'object') return { id: b.id || generateId(), type: b.type || 'text', content: b.content || '', checked: !!b.checked };
        return null;
      }).filter(Boolean);
    }
    if (initialBlocks.length === 0) initialBlocks = [{ id: generateId(), type: 'text', content: note.content || '', checked: false }];

    setFormData({ 
      ...note, 
      title: typeof note.title === 'string' ? note.title : '',
      categoryId: note.categoryId || 'freenote',
      blocks: initialBlocks,
      dueDate: note.dueDate || ''
    });
    setIsModalOpen(true);
  };

  const saveNote = async (e) => {
    if (e) e.preventDefault();
    if (!formData.title.trim() || !user) return;
    if (editingNote) {
      await setDoc(getNoteDoc(editingNote.id), formData, { merge: true });
    } else {
      const newId = generateId();
      await setDoc(getNoteDoc(newId), { ...formData, id: newId, isCompleted: false, createdAt: Date.now(), order: Date.now() });
    }
    setIsModalOpen(false);
  };

  const deleteNote = async (id) => {
    if (!user) return;
    await deleteDoc(getNoteDoc(id));
    setIsModalOpen(false);
  };

  const toggleComplete = async (e, id) => {
    e.stopPropagation();
    if (!user) return;
    const note = safeNotes.find(n => n && n.id === id);
    if (note) {
      setNotes(safeNotes.map(n => n && n.id === id ? { ...n, isCompleted: !n.isCompleted } : n));
      await setDoc(getNoteDoc(id), { isCompleted: !note.isCompleted }, { merge: true });
    }
  };

  const handleBoardBlockCheckToggle = async (e, noteId, blockId) => {
    e.stopPropagation();
    if (!user) return;
    const note = safeNotes.find(n => n && n.id === noteId);
    if (note && Array.isArray(note.blocks)) {
      const newBlocks = note.blocks.map(b => b && b.id === blockId ? { ...b, checked: !b.checked } : b);
      setNotes(safeNotes.map(n => n && n.id === noteId ? { ...n, blocks: newBlocks } : n));
      await setDoc(getNoteDoc(noteId), { blocks: newBlocks }, { merge: true });
    }
  };

  // --- ドラッグ＆ドロップ（カテゴリー） ---
  const handleCategoryDragStart = (e, id) => {
    if (!isCategoryEditMode) { e.preventDefault(); return; }
    e.stopPropagation();
    e.dataTransfer.setData('categoryId', id);
    setDraggedCategoryId(id);
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategoryId(null);
    setDragOverCategoryId(null);
    setCategoryDragOverIndicator(null);
  };

  const handleCategoryDragOver = (e, categoryId) => { 
    e.preventDefault(); 
    if (draggedCategoryId && draggedCategoryId !== categoryId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const position = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
      setCategoryDragOverIndicator({ id: categoryId, position });
    } else if (!draggedCategoryId && !['deadline', 'linkbook', 'all_list', 'freenote'].includes(categoryId) && categoryId !== activeCategoryId) {
      setDragOverCategoryId(categoryId); 
    }
  };

  const handleCategoryDrop = async (e, targetCategoryId) => {
    e.preventDefault(); 
    const indicator = categoryDragOverIndicator;
    setDragOverCategoryId(null);
    setCategoryDragOverIndicator(null);
    
    if (['deadline', 'linkbook', 'all_list', 'freenote'].includes(targetCategoryId)) return;

    const sourceCategoryId = e.dataTransfer.getData('categoryId');
    const sourceNoteId = e.dataTransfer.getData('noteId');

    if (sourceCategoryId && sourceCategoryId !== targetCategoryId && user) {
      const sortedCategories = [...safeCategories];
      const srcIdx = sortedCategories.findIndex(c => c && c.id === sourceCategoryId);
      if (srcIdx === -1) return;

      const [removed] = sortedCategories.splice(srcIdx, 1);
      const targetIdxAfterRemove = sortedCategories.findIndex(c => c && c.id === targetCategoryId);
      
      if (targetIdxAfterRemove === -1) {
        sortedCategories.push(removed);
      } else {
        const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
        sortedCategories.splice(insertIndex, 0, removed);
      }
      
      const updatedCategories = sortedCategories.map((c, index) => ({ ...c, order: (index + 1) * 1000 }));
      setCategories(updatedCategories);
      for (const c of updatedCategories) {
        if (c && c.id) await setDoc(getCategoryDoc(c.id), { order: c.order }, { merge: true });
      }
      return;
    }

    if (!sourceNoteId || targetCategoryId === activeCategoryId || !user) return;
    setNotes(safeNotes.map(n => n && n.id === sourceNoteId ? { ...n, categoryId: targetCategoryId, order: Date.now() } : n));
    await setDoc(getNoteDoc(sourceNoteId), { categoryId: targetCategoryId, order: Date.now() }, { merge: true });
  };

  // --- ドラッグ＆ドロップ（メモ・付箋） ---
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('noteId', id); setDraggedNoteId(id);
    setTimeout(() => { const el = document.getElementById(`note-${id}`); if (el) el.classList.add('opacity-40'); }, 0);
  };
  const handleDragEnd = (e, id) => {
    setDraggedNoteId(null); setDragOverIndicator(null); setDragOverCategoryId(null);
    const el = document.getElementById(`note-${id}`); if (el) el.classList.remove('opacity-40');
  };
  const handleDragOverNote = (e, id) => {
    e.preventDefault();
    if (draggedNoteId === id || activeCategoryId === 'deadline' || activeCategoryId === 'all_list') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
    setDragOverIndicator({ id, position });
  };
  const handleDragLeaveNote = () => setDragOverIndicator(null);
  
  const handleDropOnNote = async (e, targetId) => {
    e.preventDefault();
    const indicator = dragOverIndicator;
    setDragOverIndicator(null);
    if (activeCategoryId === 'deadline' || activeCategoryId === 'all_list') return;
    
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || sourceId === targetId || !user) return;
    
    const categoryNotes = safeNotes.filter(n => n && n.categoryId === activeCategoryId).sort((a,b) => a.order - b.order);
    const sourceIndex = categoryNotes.findIndex(n => n && n.id === sourceId);
    if (sourceIndex === -1) return;
    
    const newCategoryNotes = [...categoryNotes];
    const [removed] = newCategoryNotes.splice(sourceIndex, 1);
    
    const targetIdxAfterRemove = newCategoryNotes.findIndex(n => n && n.id === targetId);
    if (targetIdxAfterRemove === -1) return;
    
    const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
    newCategoryNotes.splice(insertIndex, 0, removed);
    
    const updatedNotes = newCategoryNotes.map((note, index) => ({ ...note, order: index * 1000 }));
    setNotes(prev => [...prev.filter(n => n && n.categoryId !== activeCategoryId), ...updatedNotes]);
    for (const note of updatedNotes) {
      if (note && note.id) await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true });
    }
  };

  const handleFreenotePointerDown = (e, note) => {
    if (e.target.closest('.no-drag') || e.button !== 0) return;
    setCanvasDragState({ id: note.id, startX: e.clientX, startY: e.clientY, initialX: note.x || 40, initialY: note.y || 40 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleFreenotePointerMove = (e) => {
    if (!canvasDragState) return;
    const dx = (e.clientX - canvasDragState.startX) / freenoteZoom;
    const dy = (e.clientY - canvasDragState.startY) / freenoteZoom;
    setNotes(prev => prev.map(n => n && n.id === canvasDragState.id ? { ...n, x: canvasDragState.initialX + dx, y: canvasDragState.initialY + dy } : n));
  };
  const handleFreenotePointerUp = async (e) => {
    if (!canvasDragState) return;
    const targetNote = safeNotes.find(n => n && n.id === canvasDragState.id);
    setCanvasDragState(null);
    if (targetNote && user) await setDoc(getNoteDoc(targetNote.id), { x: targetNote.x, y: targetNote.y }, { merge: true });
  };
  
  const handleFreenoteDoubleClick = (e) => {
    if (!e || !e.target) return;
    const className = e.target.className;
    const classStr = (typeof className === 'string') 
      ? className 
      : (className && typeof className.baseVal === 'string' ? className.baseVal : '');
    
    if (!classStr.includes('pointer-events-auto') && !classStr.includes('radial-gradient')) return;

    const rect = freenoteRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left + freenoteRef.current.scrollLeft) / freenoteZoom;
    const y = (e.clientY - rect.top + freenoteRef.current.scrollTop) / freenoteZoom;
    
    setEditingNote(null);
    setFormData({ title: '', categoryId: 'freenote', blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '', x, y });
    setIsModalOpen(true);
  };

  // --- ドラッグ＆ドロップ（リンク集） ---
  const handleLinkDragStart = (e, id) => {
    e.dataTransfer.setData('linkId', id); setDraggedLinkId(id);
  };
  const handleLinkDragOver = (e, id) => {
    e.preventDefault(); 
    if (draggedLinkId !== id) {
      const rect = e.currentTarget.getBoundingClientRect();
      const position = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
      setLinkDragOverIndicator({ id, position });
    }
  };
  const handleLinkDrop = async (e, targetId) => {
    e.preventDefault(); 
    const indicator = linkDragOverIndicator;
    setLinkDragOverIndicator(null);
    const sourceId = e.dataTransfer.getData('linkId');
    if (!sourceId || sourceId === targetId || !user) return;

    const currentLinks = linkFilter === 'すべて' ? safeLinks : safeLinks.filter(l => (l.groupName || 'すべて') === linkFilter);
    const sortedCurrentLinks = currentLinks.sort((a,b) => a.order - b.order);
    
    const sourceIdx = sortedCurrentLinks.findIndex(l => l && l.id === sourceId);
    if (sourceIdx === -1) return;

    const newLinks = [...sortedCurrentLinks];
    const [removed] = newLinks.splice(sourceIdx, 1);
    
    const targetIdxAfterRemove = newLinks.findIndex(l => l && l.id === targetId);
    if (targetIdxAfterRemove === -1) {
      newLinks.push(removed);
    } else {
      const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
      newLinks.splice(insertIndex, 0, removed);
    }

    const updatedLinks = newLinks.map((l, i) => ({ ...l, order: i * 1000 }));
    setLinks(prev => [...prev.filter(l => l && !updatedLinks.find(ul => ul && ul.id === l.id)), ...updatedLinks]);
    
    for (const l of updatedLinks) {
      if (l && l.id) await setDoc(getLinkDoc(l.id), { order: l.order }, { merge: true });
    }
  };
  const handleLinkDragEnd = () => {
    setDraggedLinkId(null);
    setLinkDragOverIndicator(null);
  };

  // 削除確認処理
  const requestDeleteCategory = (id, name) => setConfirmDialog({ isOpen: true, message: `ボード「${name}」を削除しますか？`, targetId: id, actionType: 'category' });
  const requestDeleteNote = (id) => setConfirmDialog({ isOpen: true, message: 'このメモを削除しますか？', targetId: id, actionType: 'note' });
  const requestDeleteLink = (id) => setConfirmDialog({ isOpen: true, message: 'このリンクを削除しますか？', targetId: id, actionType: 'link' });

  const executeConfirmAction = async () => {
    const { actionType, targetId } = confirmDialog;
    if (actionType === 'category') {
      await handleDeleteCategory(targetId);
    } else if (actionType === 'note') {
      await deleteNote(targetId);
      setIsModalOpen(false);
    } else if (actionType === 'link') {
      await deleteLink(targetId);
    }
    setConfirmDialog({ isOpen: false, message: '', targetId: null, actionType: null });
  };

  // --- ブロックエディタ（WYSIWYG化） ---
  const addBlock = (type) => {
    setFormData(prev => {
      const newId = generateId();
      const newBlocks = [...prev.blocks, { id: newId, type, content: '', checked: false }];
      setTimeout(() => { const el = document.getElementById(`block-input-${newId}`); if(el) el.focus(); }, 50);
      return { ...prev, blocks: newBlocks };
    });
  };

  const updateBlock = (blockId, contentHtml) => {
    setFormData(prev => ({ ...prev, blocks: prev.blocks.map(b => b && b.id === blockId ? { ...b, content: contentHtml } : b) }));
  };

  const removeBlock = (blockId) => setFormData(prev => ({ ...prev, blocks: prev.blocks.filter(b => b && b.id !== blockId) }));

  // ネイティブコマンドによる超直感的なインライン装飾
  const applyTextStyle = (styleType, colorValue = null) => {
    if (styleType === 'bold') {
      document.execCommand('bold', false, null);
    } else if (styleType === 'underline') {
      document.execCommand('underline', false, null);
    } else if (styleType === 'color') {
      document.execCommand('foreColor', false, colorValue);
    }
  };

  // エンターキーでの新しい行（ブロック）の追加
  const handleKeyDown = (e, index, blockType, blockId) => {
    if (e.nativeEvent.isComposing) return;
    
    if (e.key === 'Backspace') {
      const el = document.getElementById(`block-input-${blockId}`);
      if (el && el.innerText.trim() === '') {
        e.preventDefault();
        if (formData.blocks.length > 1) {
          removeBlock(blockId);
          if (index > 0) {
            const prevBlock = formData.blocks[index - 1];
            if (prevBlock) {
              setTimeout(() => {
                const prevInput = document.getElementById(`block-input-${prevBlock.id}`);
                if (prevInput) {
                  prevInput.focus();
                  // カーソルを末尾へ
                  const selection = window.getSelection();
                  const range = document.createRange();
                  range.selectNodeContents(prevInput);
                  range.collapse(false);
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
              }, 10);
            }
          }
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (blockType === 'list' || blockType === 'checkbox') {
        e.preventDefault();
        const newId = generateId();
        const newBlock = { id: newId, type: blockType, content: '', checked: false };
        setFormData(prev => {
          const newBlocks = [...prev.blocks];
          newBlocks.splice(index + 1, 0, newBlock);
          return { ...prev, blocks: newBlocks };
        });
        setTimeout(() => { const el = document.getElementById(`block-input-${newId}`); if (el) el.focus(); }, 10);
      }
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result);
      setFormData(prev => {
        const newId = generateId();
        return { ...prev, blocks: [...prev.blocks, { id: newId, type: 'image', content: compressedUrl, checked: false }] };
      });
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handlePaste = async (e, blockId, index) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const files = Array.from(clipboardData.files || []);
    const imageFiles = files.filter(f => f && f.type && f.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      e.preventDefault();
      const file = imageFiles[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressedUrl = await compressImage(reader.result);
        setFormData(prev => {
          const newBlocks = [...prev.blocks];
          newBlocks.splice(index + 1, 0, { id: generateId(), type: 'image', content: compressedUrl, checked: false });
          return { ...prev, blocks: newBlocks };
        });
      };
      reader.readAsDataURL(file);
      return;
    }
    // 画像以外は contentEditable のネイティブのペースト挙動に任せる
  };

  // すべてのメモのソートハンドラ
  const handleSort = (key) => {
    if (allListSortConfig.key === key) {
      setAllListSortConfig({ key, direction: allListSortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setAllListSortConfig({ key, direction: 'asc' });
    }
  };

  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#333333] p-6">
        <div className="bg-[#FFFFFF] p-8 rounded-2xl shadow-lg border border-[#D7DCD9] max-w-lg w-full">
          <div className="w-16 h-16 bg-[#F7F9F8] text-[#FFE600] rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8" /></div>
          <h2 className="text-[20px] font-bold mb-4 text-center">Firebaseの設定が完了していません</h2>
        </div>
      </div>
    );
  }

  // ★ 復活したログイン画面
  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#333333] p-6">
        <div className="bg-[#FFFFFF] p-10 rounded-3xl shadow-xl border border-[#D7DCD9] max-w-md w-full text-center">
          <div className="w-20 h-20 bg-[#E0FFEE] text-[#00CC5B] rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3"><CheckSquare className="w-10 h-10" /></div>
          <h1 className="text-[32px] font-bold mb-2 text-[#333333]">Kanban Notes</h1>
          <button onClick={handleGoogleLogin} className="mt-8 w-full flex items-center justify-center gap-[8px] bg-[#FFFFFF] border-2 border-[#D7DCD9] hover:border-[#00CC5B] hover:bg-[#F7F9F8] text-[#333333] px-6 py-4 rounded-xl font-bold text-[16px] transition-all shadow-sm">
            Googleでログインして始める
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#666666]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00CC5B] mb-4" />
        <p className="font-medium text-[16px]">同期中...</p>
      </div>
    );
  }

  // リスト生成
  let activeNotes = [];
  if (activeCategoryId === 'all_list') {
    let filtered = safeNotes.filter(n => n && (showCompleted ? true : !n.isCompleted));
    const categoryOrderMap = safeCategories.reduce((acc, cat) => { if (cat && cat.id) acc[cat.id] = cat.order; return acc; }, {});
    
    filtered.sort((a, b) => {
      if (!a || !b) return 0;
      const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      const orderA = a.categoryId === 'freenote' ? -1 : (categoryOrderMap[a.categoryId] !== undefined ? categoryOrderMap[a.categoryId] : Infinity);
      const orderB = b.categoryId === 'freenote' ? -1 : (categoryOrderMap[b.categoryId] !== undefined ? categoryOrderMap[b.categoryId] : Infinity);

      if (allListSortConfig.key === 'dueDate') {
        if (dateA !== dateB) return allListSortConfig.direction === 'asc' ? (dateA < dateB ? -1 : 1) : (dateA < dateB ? 1 : -1);
        if (orderA !== orderB) return orderA - orderB;
        return (a.order || 0) - (b.order || 0);
      } else if (allListSortConfig.key === 'category') {
        if (orderA !== orderB) return allListSortConfig.direction === 'asc' ? orderA - orderB : orderB - orderA;
        if (dateA !== dateB) return dateA < dateB ? -1 : 1;
        return (a.order || 0) - (b.order || 0);
      }
      return 0;
    });
    activeNotes = filtered;
  } else if (activeCategoryId === 'deadline') {
    activeNotes = safeNotes.filter(n => n && n.dueDate && (showCompleted ? true : !n.isCompleted)).sort((a, b) => {
      if (!a || !b) return 0;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  } else if (activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook') {
    activeNotes = safeNotes.filter(n => n && n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted));
  }

  const safeActiveNotes = Array.isArray(activeNotes) ? activeNotes.filter(Boolean) : [];
  const linkGroups = ['すべて', ...Array.from(new Set(safeLinks.map(l => l?.groupName).filter(Boolean)))];
  if (!linkGroups.includes('一般')) linkGroups.push('一般');
  const filteredLinks = linkFilter === 'すべて' ? safeLinks : safeLinks.filter(l => l && (l.groupName || '一般') === linkFilter);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9F8] text-[#333333]">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700&family=Roboto:wght@500;700&display=swap');
        body { font-family: 'Roboto', 'Noto Sans JP', sans-serif; font-weight: 500; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #D7DCD9; border-radius: 20px; }
      `}} />

      {/* サイドバーオーバーレイ背景 */}
      {isSidebarOpen && <div className="fixed inset-0 bg-[#333333]/20 backdrop-blur-sm z-40 transition-opacity" onClick={() => setIsSidebarOpen(false)} />}

      {/* サイドバー */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-[#FFFFFF] border-r border-[#D7DCD9] flex flex-col transform transition-transform duration-300 ease-in-out z-50 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-[#D7DCD9] shrink-0">
          <h1 className="text-[20px] font-bold text-[#333333] flex items-center gap-[8px]">
            Kanban Notes
          </h1>
          <button className="p-1 text-[#666666] hover:bg-[#F7F9F8] rounded-lg" onClick={() => setIsSidebarOpen(false)}><X className="w-5 h-5"/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 px-3 flex flex-col gap-1">
            <div onClick={() => handleTabClick('all_list')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'all_list' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
              <AlignLeft className="w-5 h-5" />
              <span className="font-bold text-[14px]">すべてのメモ</span>
            </div>

            <div onClick={() => handleTabClick('freenote')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'freenote' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
              <PenTool className="w-5 h-5" />
              <span className="font-bold text-[14px]">フリーノート</span>
            </div>
          
            <div onClick={() => handleTabClick('deadline')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'deadline' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
              <Calendar className="w-5 h-5" />
              <span className="font-bold text-[14px]">期限付き</span>
            </div>

            <div onClick={() => handleTabClick('linkbook')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer mb-4 ${activeCategoryId === 'linkbook' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
              <BookOpen className="w-5 h-5" />
              <span className="font-bold text-[14px]">リンク集</span>
            </div>

            <div className="px-3 pt-2 pb-1 text-[12px] font-bold text-[#C4C4C4] flex items-center justify-between">
              ボート一覧
              <div className="flex items-center gap-2">
                <button onClick={() => setIsCategoryEditMode(!isCategoryEditMode)} className={`hover:text-[#00CC5B] transition-colors ${isCategoryEditMode ? 'text-[#00CC5B]' : ''}`}>
                  {isCategoryEditMode ? '完了' : '編集'}
                </button>
                <button onClick={handleAddCategory} className="hover:text-[#00CC5B] transition-colors"><Plus className="w-4 h-4"/></button>
              </div>
            </div>

            {safeCategories.map(category => (
              <div
                key={category.id || generateId()}
                draggable={isCategoryEditMode}
                onDragStart={(e) => handleCategoryDragStart(e, category.id)}
                onDragEnd={handleCategoryDragEnd}
                onClick={() => { if (!isCategoryEditMode && category.id) handleTabClick(category.id); }}
                onDragOver={(e) => handleCategoryDragOver(e, category.id)}
                onDragLeave={() => { setDragOverCategoryId(null); setCategoryDragOverIndicator(null); }}
                onDrop={(e) => handleCategoryDrop(e, category.id)}
                className={`flex items-center gap-[8px] px-3 py-2 rounded-xl transition-colors group relative
                  ${!isCategoryEditMode ? 'cursor-pointer' : ''}
                  ${activeCategoryId === category.id && !isCategoryEditMode ? 'bg-[#E0FFEE] text-[#00CC5B]' : dragOverCategoryId === category.id ? 'bg-[#E0FFEE] text-[#00AC4C] border border-[#00CC5B] scale-105' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}
                `}
              >
                {categoryDragOverIndicator?.id === category.id && categoryDragOverIndicator?.position === 'top' && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#00CC5B] rounded-full z-10 -mt-[2px]"></div>
                )}
                {categoryDragOverIndicator?.id === category.id && categoryDragOverIndicator?.position === 'bottom' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#00CC5B] rounded-full z-10 -mb-[2px]"></div>
                )}
                
                {isCategoryEditMode && <GripVertical className="w-4 h-4 text-[#C4C4C4] cursor-grab active:cursor-grabbing shrink-0" />}

                {editingCategoryId === category.id ? (
                  <input type="text" value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onBlur={() => saveCategoryName(category.id)} onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)} autoFocus className="border border-[#00CC5B] rounded px-2 py-0.5 text-[14px] outline-none bg-[#FFFFFF] w-full" />
                ) : (
                  <>
                    <span className="font-bold text-[14px] select-none flex-1 truncate">{category.name || '無題のボード'}</span>
                    {isCategoryEditMode && (
                      <div className="flex items-center ml-1 shrink-0 gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="p-1 text-[#666666] bg-[#F7F9F8] hover:text-[#00CC5B] hover:bg-[#E0FFEE] transition-colors rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); requestDeleteCategory(category.id, category.name); }} className="p-1 text-[#666666] bg-[#F7F9F8] hover:text-[#ED1C24] transition-colors rounded"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-[#D7DCD9] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-[8px] text-[14px] text-[#666666] font-medium truncate">
              {user?.photoURL && <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-[#D7DCD9]" />}
              <span className="truncate">{user?.displayName || 'ユーザー'}</span>
            </div>
            <button onClick={handleLogout} className="p-2 text-[#666666] hover:text-[#333333] hover:bg-[#F7F9F8] rounded-lg transition-colors shrink-0"><LogOut className="w-5 h-5" /></button>
          </div>
      </aside>

      {/* メイン画面 */}
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden relative">
        <header className="bg-[#FFFFFF] border-b border-[#D7DCD9] h-16 flex items-center justify-between px-4 sm:px-6 shrink-0 z-10">
          <div className="flex items-center">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 mr-2 text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333] rounded-lg transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-[18px] sm:text-[20px] font-bold text-[#333333]">
              {activeCategoryId === 'freenote' ? 'フリーノート' : activeCategoryId === 'deadline' ? '期限付きメモ' : activeCategoryId === 'linkbook' ? 'リンク集' : activeCategoryId === 'all_list' ? 'すべてのメモ' : safeCategories.find(c => c && c.id === activeCategoryId)?.name || 'ボード'}
            </h2>
          </div>
          
          {activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook' && (
            <div className="flex items-center gap-4">
              <label className="hidden sm:flex items-center gap-[4px] cursor-pointer text-[14px] text-[#666666] hover:text-[#333333] transition-colors select-none">
                <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="w-4 h-4 rounded text-[#00CC5B] focus:ring-[#00CC5B]" />
                <span className="font-medium">完了を表示</span>
              </label>
              <button onClick={() => openAddModal()} className="flex items-center justify-center gap-1.5 bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] px-3 sm:px-4 py-2 rounded-lg transition-colors shadow-sm text-[14px] font-bold">
                <Plus className="w-5 h-5" /> <span className="hidden sm:inline">新規メモ</span>
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto relative">
          
          {/* リスト表示（すべてのメモ） */}
          {activeCategoryId === 'all_list' && (
            <div className="max-w-5xl mx-auto h-full p-4 sm:p-6 flex flex-col">
              <div className="bg-[#FFFFFF] rounded-xl shadow-sm border border-[#D7DCD9] overflow-hidden flex flex-col flex-1">
                <div className="overflow-y-auto custom-scrollbar flex-1">
                  <table className="w-full text-left text-[#333333] text-[13px]">
                    <thead className="bg-[#F7F9F8] sticky top-0 z-10 border-b border-[#D7DCD9]">
                      <tr>
                        <th className="px-2 py-1.5 font-bold w-10 sm:w-12 text-center text-[#666666]">完了</th>
                        <th className="px-2 py-1.5 font-bold w-20 sm:w-28 text-[#666666] cursor-pointer hover:bg-[#F7F9F8] transition-colors select-none" onClick={() => handleSort('dueDate')}>
                          期限 {allListSortConfig.key === 'dueDate' ? (allListSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th className="px-2 py-1.5 font-bold w-24 sm:w-32 text-[#666666] cursor-pointer hover:bg-[#F7F9F8] transition-colors select-none" onClick={() => handleSort('category')}>
                          ボード名 {allListSortConfig.key === 'category' ? (allListSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th className="px-2 py-1.5 font-bold w-32 sm:w-48 text-[#666666]">タイトル</th>
                        <th className="px-2 py-1.5 font-bold text-[#666666]">本文</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeActiveNotes.map((note, index) => {
                        const catName = note.categoryId === 'freenote' ? 'フリーノート' : safeCategories.find(c => c && c.id === note.categoryId)?.name || '不明';
                        const dueDateInfo = formatDueDate(note.dueDate);
                        
                        // HTMLタグを削除してプレーンテキストにする安全な処理
                        const plainText = Array.isArray(note.blocks)
                          ? note.blocks.filter(b => b && (b.type === 'text' || b.type === 'list' || b.type === 'checkbox'))
                              .map(b => (b.content || '').replace(/<[^>]*>?/gm, ''))
                              .join(' ').replace(/\s+/g, ' ').trim()
                          : '';
                        
                        return (
                          <tr key={note.id} onClick={() => openEditModal(note)} className={`cursor-pointer transition-colors group ${index % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F7F9F8]/50'} hover:bg-[#E0FFEE]/30`}>
                            <td className="px-2 py-1.5 text-center" onClick={(e) => { e.stopPropagation(); toggleComplete(e, note.id); }}>
                              {note.isCompleted ? <CheckCircle2 className="w-4 h-4 text-[#00CC5B] mx-auto" /> : <Circle className="w-4 h-4 text-[#C4C4C4] group-hover:text-[#00CC5B] mx-auto" />}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {dueDateInfo ? (
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${dueDateInfo.isPast && !note.isCompleted ? 'bg-[#FFE600]/30 text-[#ED1C24]' : 'bg-[#E0FFEE] text-[#00AC4C]'}`}>
                                  {dueDateInfo.text}
                                </span>
                              ) : (
                                <span className="text-[#C4C4C4]">-</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-[#666666] text-[12px] font-medium truncate max-w-[80px] sm:max-w-[120px]">
                              {catName}
                            </td>
                            <td className={`px-2 py-1.5 font-bold truncate max-w-[100px] sm:max-w-[180px] ${note.isCompleted ? 'text-[#666666] line-through' : ''}`}>
                              {typeof note.title === 'string' ? note.title : String(note.title || '無題')}
                            </td>
                            <td className={`px-2 py-1.5 truncate max-w-[120px] sm:max-w-[250px] lg:max-w-[400px] text-[12px] ${note.isCompleted ? 'text-[#C4C4C4]' : 'text-[#666666]'}`}>
                              {plainText || <span className="text-[#C4C4C4]">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {safeActiveNotes.length === 0 && <div className="p-8 text-center text-[#666666] font-medium">メモがありません。</div>}
                </div>
              </div>
            </div>
          )}

          {activeCategoryId === 'freenote' && (
            <>
              <div className="w-full h-full overflow-auto custom-scrollbar" ref={freenoteRef} onDoubleClick={handleFreenoteDoubleClick}>
                <div style={{ width: 5000 * freenoteZoom, height: 5000 * freenoteZoom, backgroundImage: 'radial-gradient(#D7DCD9 2px, transparent 2px)', backgroundSize: `${30 * freenoteZoom}px ${30 * freenoteZoom}px` }} className="relative pointer-events-none origin-top-left">
                  <div className="pointer-events-auto" style={{ transform: `scale(${freenoteZoom})`, transformOrigin: '0 0', width: 5000, height: 5000 }}>
                    {safeNotes.filter(n => n && n.categoryId === 'freenote').map(note => {
                      const firstImageBlock = Array.isArray(note.blocks) ? note.blocks.find(b => b && b.type === 'image') : null;
                      const dueDateInfo = formatDueDate(note.dueDate);
                      return (
                        <div 
                          key={note.id}
                          style={{ position: 'absolute', left: note.x || 24, top: note.y || 24, width: 320 }}
                          onPointerDown={(e) => handleFreenotePointerDown(e, note)}
                          onPointerMove={handleFreenotePointerMove}
                          onPointerUp={handleFreenotePointerUp}
                          onPointerCancel={handleFreenotePointerUp}
                          className="bg-[#FFFFFF] rounded-xl border border-[#D7DCD9] shadow-md touch-none cursor-grab active:cursor-grabbing hover:border-[#00CC5B] transition-colors z-0 hover:z-10 animate-in fade-in duration-200"
                        >
                          <div className="p-3">
                            {dueDateInfo && !note.isCompleted && (
                              <div className={`text-[12px] font-bold px-2 py-0.5 rounded flex items-center gap-1 w-fit mb-2 ${dueDateInfo.isPast ? 'bg-[#FFE600]/30 text-[#ED1C24]' : 'bg-[#E0FFEE] text-[#00AC4C]'}`}>
                                <Clock className="w-3 h-3" /> {dueDateInfo.text}
                              </div>
                            )}
                            {firstImageBlock && (
                              <div className="mb-2 rounded-lg overflow-hidden max-h-32 bg-[#F7F9F8] border border-[#D7DCD9] flex items-center justify-center opacity-90">
                                <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-32 object-contain" />
                              </div>
                            )}
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold text-[#333333] text-[16px] pr-2 leading-[1.6] line-clamp-2">{typeof note.title === 'string' ? note.title : String(note.title || '無題')}</h3>
                              <button onClick={(e) => { e.stopPropagation(); openEditModal(note); }} className="no-drag p-1 text-[#666666] hover:text-[#00CC5B] bg-[#F7F9F8] rounded-md shrink-0"><Edit2 className="w-4 h-4"/></button>
                            </div>
                            <div className="max-h-[300px] overflow-hidden relative no-drag text-[12px]">
                              <div className="space-y-0 pb-6">
                                {Array.isArray(note.blocks) && note.blocks.slice(0, 20).map(block => {
                                  if (!block) return null;
                                  return (
                                    <div key={block.id || generateId()} className="py-0">
                                      {block.type === 'text' && <div dangerouslySetInnerHTML={{ __html: applyDictionaryLinks(block.content, safeLinks, note.categoryId) }} className="whitespace-pre-wrap font-medium leading-[1.6] text-[14px] text-[#666666] break-words" />}
                                      {block.type === 'list' && (
                                        <div className="flex items-start gap-[4px] font-medium leading-[1.6] text-[14px] text-[#666666]">
                                          <span className="font-bold mt-[2px] shrink-0">•</span><div dangerouslySetInnerHTML={{ __html: applyDictionaryLinks(block.content, safeLinks, note.categoryId) }} className="break-words" />
                                        </div>
                                      )}
                                      {block.type === 'checkbox' && (
                                        <div className="flex items-start gap-[4px] cursor-pointer group/check font-medium leading-[1.6] text-[14px]" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                          {block.checked ? <CheckCircle2 className="w-[16px] h-[16px] text-[#00CC5B] mt-[2px] flex-shrink-0 group-hover/check:opacity-70" /> : <Circle className="w-[16px] h-[16px] text-[#C4C4C4] mt-[2px] flex-shrink-0 group-hover/check:text-[#00CC5B]" />}
                                          <div dangerouslySetInnerHTML={{ __html: applyDictionaryLinks(block.content, safeLinks, note.categoryId) }} className={`${block.checked ? 'line-through text-[#666666]' : 'text-[#666666]'} leading-[1.6] break-words`} />
                                        </div>
                                      )}
                                      {block.type === 'image' && !firstImageBlock && <div className="text-[12px] text-[#666666] flex items-center gap-[4px] my-1"><ImageIcon className="w-3 h-3"/> 画像</div>}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#FFFFFF] to-transparent pointer-events-none"></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-[#FFFFFF] p-2 rounded-xl shadow-lg border border-[#D7DCD9] z-10">
                <button onClick={() => setFreenoteZoom(prev => Math.max(prev - 0.1, 0.1))} className="p-2 hover:bg-[#F7F9F8] rounded-lg text-[#666666]"><ZoomOut className="w-5 h-5"/></button>
                <select value={freenoteZoom.toFixed(1)} onChange={e => setFreenoteZoom(Number(e.target.value))} className="bg-transparent font-bold text-[#333333] outline-none cursor-pointer text-center w-16 text-[14px]">
                  {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 2.0].map(v => (
                    <option key={v.toFixed(1)} value={v.toFixed(1)}>{Math.round(v * 100)}%</option>
                  ))}
                </select>
                <button onClick={() => setFreenoteZoom(prev => Math.min(prev + 0.1, 2.0))} className="p-2 hover:bg-[#F7F9F8] rounded-lg text-[#666666]"><ZoomIn className="w-5 h-5"/></button>
              </div>
            </>
          )}

          {activeCategoryId === 'linkbook' && (
            <div className="max-w-3xl mx-auto h-full p-4 sm:p-6 flex flex-col">
              <div className="flex gap-2 mb-4 overflow-x-auto custom-scrollbar pb-1">
                {linkGroups.map(group => (
                  <button 
                    key={group} 
                    onClick={() => setLinkFilter(group)}
                    className={`px-4 py-2 rounded-full text-[14px] font-bold whitespace-nowrap transition-colors border ${linkFilter === group ? 'bg-[#333333] text-white border-[#333333]' : 'bg-white text-[#666666] border-[#D7DCD9] hover:border-[#333333]'}`}
                  >
                    {group}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto bg-white rounded-xl shadow-sm border border-[#D7DCD9] p-2 flex flex-col gap-1">
                {filteredLinks.length === 0 && <div className="p-8 text-center text-[#666666] font-medium">表示するリンクがありません。</div>}
                {filteredLinks.map(link => {
                  if (!link) return null;
                  return (
                    <div 
                      key={link.id} 
                      draggable 
                      onDragStart={(e) => handleLinkDragStart(e, link.id)}
                      onDragEnd={handleLinkDragEnd}
                      onDragOver={(e) => handleLinkDragOver(e, link.id)}
                      onDragLeave={() => setLinkDragOverIndicator(null)}
                      onDrop={(e) => handleLinkDrop(e, link.id)}
                      className={`px-3 py-2 flex items-center justify-between gap-4 transition-colors cursor-grab active:cursor-grabbing rounded-lg relative hover:bg-[#F7F9F8]`}
                    >
                      {linkDragOverIndicator?.id === link.id && linkDragOverIndicator?.position === 'top' && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-[#00CC5B] rounded-full z-10 -mt-[2px]"></div>
                      )}
                      {linkDragOverIndicator?.id === link.id && linkDragOverIndicator?.position === 'bottom' && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#00CC5B] rounded-full z-10 -mb-[2px]"></div>
                      )}
                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                        <GripVertical className="w-4 h-4 text-[#C4C4C4] shrink-0" />
                        <div className="font-bold text-[#333333] text-[16px] truncate">{typeof link.word === 'string' ? link.word : '無題'}</div>
                        <div className="text-[12px] text-[#00CC5B] bg-[#E0FFEE] px-2 py-0.5 rounded shrink-0">{typeof link.groupName === 'string' ? link.groupName : '一般'}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-[#F7F9F8] hover:bg-[#E0FFEE] hover:text-[#00CC5B] text-[#666666] rounded-md transition-colors text-[12px] font-bold">
                          開く <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => { setLinkFormData(link); setIsLinkModalOpen(true); }} className="p-1.5 text-[#C4C4C4] hover:text-[#00CC5B] transition-colors"><Edit2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-6 right-6">
                <button onClick={() => { setLinkFormData({ id: '', word: '', url: '', groupName: linkFilter === 'すべて' ? '一般' : linkFilter }); setIsLinkModalOpen(true); }} className="flex items-center justify-center bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] w-14 h-14 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-1" title="リンクを追加">
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
          )}

          {activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook' && activeCategoryId !== 'all_list' && (
            <div className="max-w-7xl mx-auto h-full p-4 sm:p-6">
              {safeActiveNotes.length === 0 ? (
                <div onClick={() => openAddModal()} className="text-center py-16 border-2 border-dashed border-[#D7DCD9] rounded-2xl text-[#666666] hover:border-[#00CC5B] hover:text-[#00AC4C] transition-colors cursor-pointer max-w-lg mx-auto mt-10">
                  <div className="text-[18px] font-bold mb-2">メモがありません</div>
                  <div className="text-[14px] font-medium">＋ ここをクリックして新しいメモを追加</div>
                </div>
              ) : (
                <div className="columns-2 lg:columns-3 xl:columns-4 gap-3 sm:gap-6 pb-10">
                  {safeActiveNotes.map((note) => {
                    const firstImageBlock = Array.isArray(note.blocks) ? note.blocks.find(b => b && b.type === 'image') : null;
                    const dueDateInfo = formatDueDate(note.dueDate);
                    return (
                      <div
                        id={`note-${note.id}`}
                        key={note.id}
                        draggable={activeCategoryId !== 'deadline'}
                        onDragStart={(e) => handleDragStart(e, note.id)}
                        onDragEnd={handleDragEnd(e, note.id)}
                        onDragOver={(e) => handleDragOverNote(e, note.id)}
                        onDragLeave={handleDragLeaveNote}
                        onDrop={(e) => handleDropOnNote(e, note.id)}
                        onClick={() => openEditModal(note)}
                        className={`break-inside-avoid mb-3 sm:mb-6 group rounded-xl p-3 sm:p-4 transition-all cursor-pointer relative bg-[#FFFFFF] border
                          ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'top' ? 'border-t-[4px] border-t-[#00CC5B] border-b-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                          ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'bottom' ? 'border-b-[4px] border-b-[#00CC5B] border-t-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                          ${!dragOverIndicator || dragOverIndicator.id !== note.id ? 'border-[#D7DCD9] hover:border-[#00CC5B] hover:shadow-md' : ''}
                          ${note.isCompleted ? 'opacity-60 bg-[#F7F9F8]' : ''}
                        `}
                      >
                        {dueDateInfo && !note.isCompleted && (
                          <div className={`text-[12px] font-bold px-2 py-0.5 rounded flex items-center gap-1 w-fit mb-2 ${dueDateInfo.isPast ? 'bg-[#FFE600]/30 text-[#ED1C24]' : 'bg-[#E0FFEE] text-[#00AC4C]'}`}>
                            <Clock className="w-3 h-3" /> {dueDateInfo.text}
                          </div>
                        )}
                        {firstImageBlock && (
                          <div className="mb-2 sm:mb-3 rounded-lg overflow-hidden max-h-32 bg-[#F7F9F8] border border-[#D7DCD9] flex items-center justify-center opacity-90">
                            <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-32 object-contain" />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-1 sm:gap-2 mb-2">
                          <h3 className={`font-bold leading-[1.6] line-clamp-2 pr-5 sm:pr-6 text-[16px] ${note.isCompleted ? 'text-[#666666] line-through' : 'text-[#333333]'}`}>
                            {typeof note.title === 'string' ? note.title : String(note.title || '無題')}
                          </h3>
                          <button onClick={(e) => toggleComplete(e, note.id)} className={`absolute top-2 right-2 sm:top-3 sm:right-3 transition-colors p-0.5 sm:p-1 rounded-full shadow-sm border z-10 ${note.isCompleted ? 'text-[#00CC5B] bg-[#E0FFEE] border-[#00CC5B]' : 'text-[#C4C4C4] bg-[#FFFFFF] border-[#D7DCD9]'}`}>
                            {note.isCompleted ? <CheckCircle2 className="w-4 h-4 sm:w-5 h-5" /> : <Circle className="w-4 h-4 sm:w-5 h-5 hover:text-[#00CC5B]" />}
                          </button>
                        </div>
                        <div className="relative overflow-hidden max-h-[300px] rounded-b-lg">
                          <div className="space-y-0 pb-6">
                            {Array.isArray(note.blocks) && note.blocks.map(block => {
                              if (!block) return null;
                              return (
                                <div key={block.id || generateId()} className="py-0">
                                  {block.type === 'text' && <div dangerouslySetInnerHTML={{ __html: applyDictionaryLinks(block.content, safeLinks, note.categoryId) }} className={`whitespace-pre-wrap font-medium leading-[1.6] text-[14px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'} break-words`} />}
                                  {block.type === 'list' && (
                                    <div className={`flex items-start gap-[4px] font-medium leading-[1.6] text-[14px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'}`}>
                                      <span className="text-[#666666] font-bold mt-[2px] shrink-0">•</span><div dangerouslySetInnerHTML={{ __html: applyDictionaryLinks(block.content, safeLinks, note.categoryId) }} className="break-words" />
                                    </div>
                                  )}
                                  {block.type === 'checkbox' && (
                                    <div className="flex items-start gap-[4px] cursor-pointer group/check font-medium leading-[1.6] text-[14px]" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                      {block.checked ? <CheckCircle2 className="w-[16px] h-[16px] text-[#00CC5B] mt-[2px] flex-shrink-0 group-hover/check:opacity-70" /> : <Circle className="w-[16px] h-[16px] text-[#C4C4C4] mt-[2px] flex-shrink-0 group-hover/check:text-[#00CC5B]" />}
                                      <div dangerouslySetInnerHTML={{ __html: applyDictionaryLinks(block.content, safeLinks, note.categoryId) }} className={`${block.checked || note.isCompleted ? 'line-through text-[#666666]' : 'text-[#333333]'} leading-[1.6] break-words`} />
                                    </div>
                                  )}
                                  {block.type === 'image' && !firstImageBlock && <div className="text-[12px] text-[#666666] flex items-center gap-[4px] my-1"><ImageIcon className="w-3 h-3"/> 画像</div>}
                                </div>
                              );
                            })}
                          </div>
                          <div className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-[#F7F9F8] to-transparent' : 'bg-gradient-to-t from-[#FFFFFF] to-transparent'}`}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* メモ編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#FFFFFF] sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-[95vh] sm:max-h-[90vh] flex flex-col">
            
            {/* すっきり1行のヘッダー */}
            <div className="px-3 sm:px-4 py-2 border-b border-[#D7DCD9] bg-[#F7F9F8] sm:rounded-t-2xl shrink-0 flex items-center justify-between gap-1 sm:gap-2 z-20 relative">
              <div className="flex-1 flex items-center gap-1 sm:gap-2 overflow-x-auto custom-scrollbar pb-1 -mb-1">
                <input type="text" required value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="flex-1 min-w-[80px] sm:min-w-[120px] px-1 py-1 text-[16px] sm:text-[18px] font-bold text-[#333333] bg-transparent border-b-[2px] border-transparent hover:border-[#D7DCD9] focus:border-[#00CC5B] outline-none transition-colors placeholder:text-[#666666]" placeholder="タイトル" />
                
                {/* 期限（年を省略した MM/DD 表示） */}
                <div className="flex items-center bg-[#FFFFFF] border border-[#D7DCD9] rounded-lg px-1.5 sm:px-2 py-1 focus-within:border-[#00CC5B] transition-colors shrink-0 hover:border-[#C4C4C4] h-8">
                  <Calendar className="w-3.5 h-3.5 text-[#666666] mr-1 hidden sm:block" />
                  <div className="relative flex items-center h-full">
                    <span className="text-[12px] sm:text-[13px] text-[#333333] font-bold whitespace-nowrap text-center min-w-[36px] sm:min-w-[40px]">
                      {dueDateParts.date ? `${dueDateParts.date.split('-')[1]}/${dueDateParts.date.split('-')[2]}` : '日付設定'}
                    </span>
                    <input type="date" value={dueDateParts.date} onChange={(e) => handleDateChange('date', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  </div>
                  <div className="w-px h-3 bg-[#D7DCD9] mx-1"></div>
                  <select value={dueDateParts.hour} onChange={(e) => handleDateChange('hour', e.target.value)} className="bg-transparent text-[12px] sm:text-[13px] text-[#333333] outline-none font-bold appearance-none cursor-pointer h-full text-center">
                    {[...Array(24)].map((_, i) => { const h = String(i).padStart(2, '0'); return <option key={h} value={h}>{h}</option>; })}
                  </select>
                  <span className="text-[#666666] text-[11px] sm:text-[12px] font-medium ml-0.5">時</span>
                </div>

                {/* ボード名選択 */}
                <select value={formData.categoryId || 'freenote'} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="max-w-[80px] sm:max-w-[110px] px-1 sm:px-2 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] bg-[#FFFFFF] text-[11px] sm:text-[13px] text-[#333333] shrink-0 font-bold hover:border-[#C4C4C4] cursor-pointer h-8 truncate">
                  <option value="freenote">フリーノート</option>
                  {safeCategories.map(c => c && <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* ヘッダー右側の固定アクションエリア */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0 pl-1 sm:pl-2 ml-auto">
                <button 
                  type="button" 
                  onClick={() => setIsToolbarOpen(!isToolbarOpen)} 
                  className={`p-1.5 rounded-lg transition-colors ${isToolbarOpen ? 'text-[#00CC5B] bg-[#E0FFEE]' : 'text-[#666666] hover:bg-[#FFFFFF]'}`} 
                  title="ツールバーを表示/非表示"
                >
                  <PenTool className="w-5 h-5" />
                </button>
                {editingNote && <button type="button" onClick={() => requestDeleteNote(editingNote.id)} className="text-[#666666] hover:text-[#ED1C24] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><Trash2 className="w-4 h-4 sm:w-5 sm:h-5" /></button>}
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-[#666666] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><X className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                <button type="button" onClick={saveNote} className="ml-0.5 px-3 h-8 bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] rounded-lg font-bold transition-colors flex items-center justify-center text-[12px] sm:text-[13px]">保存</button>
              </div>
            </div>

            {/* タイトルの下に設置した開閉可能な万能ツールバー */}
            {isToolbarOpen && (
              <div className="px-3 sm:px-4 py-1.5 border-b border-[#D7DCD9] bg-[#FFFFFF] shrink-0 flex items-center gap-3 overflow-x-auto custom-scrollbar z-10 select-none">
                {/* 1. ブロック追加グループ */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] font-bold text-[#C4C4C4] mr-1 hidden sm:inline">追加:</span>
                  <button type="button" onClick={() => addBlock('text')} className="p-1.5 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors flex items-center gap-1" title="本文テキストを追加">
                    <AlignLeft className="w-4 h-4" /> <span className="text-[11px] font-bold hidden md:inline">テキスト</span>
                  </button>
                  <button type="button" onClick={() => addBlock('list')} className="p-1.5 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors flex items-center gap-1" title="箇条書きリストを追加">
                    <List className="w-4 h-4" /> <span className="text-[11px] font-bold hidden md:inline">リスト</span>
                  </button>
                  <button type="button" onClick={() => addBlock('checkbox')} className="p-1.5 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors flex items-center gap-1" title="チェックリストを追加">
                    <CheckSquare className="w-4 h-4" /> <span className="text-[11px] font-bold hidden md:inline">チェック</span>
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors flex items-center gap-1" title="画像を追加">
                    <ImageIcon className="w-4 h-4" /> <span className="text-[11px] font-bold hidden md:inline">画像</span>
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                </div>

                {/* 仕切り線 */}
                <div className="w-px h-6 bg-[#D7DCD9] shrink-0"></div>

                {/* 2. インライン文字装飾グループ（WYSIWYG用ネイティブコマンド） */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] font-bold text-[#C4C4C4] mr-1 hidden sm:inline">装飾:</span>
                  <button 
                    type="button" 
                    onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold', false, null); }} 
                    className="p-1.5 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors" 
                    title="選択した文字を太字にする"
                  >
                    <Bold className="w-4 h-4"/>
                  </button>
                  <button 
                    type="button" 
                    onMouseDown={(e) => { e.preventDefault(); document.execCommand('underline', false, null); }} 
                    className="p-1.5 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors" 
                    title="選択した文字に下線を引く"
                  >
                    <Underline className="w-4 h-4"/>
                  </button>
                </div>

                {/* 仕切り線 */}
                <div className="w-px h-6 bg-[#D7DCD9] shrink-0"></div>

                {/* 3. ダイレクト1タップカラーパレット */}
                <div className="flex items-center gap-1.5 shrink-0 Palette">
                  <span className="text-[11px] font-bold text-[#C4C4C4] mr-1 hidden sm:inline">カラー:</span>
                  {['#ED1C24', '#005BFF', '#00CC5B', '#FF8C00', '#333333'].map(color => (
                    <button 
                      key={color} 
                      type="button" 
                      onMouseDown={(e) => { e.preventDefault(); document.execCommand('foreColor', false, color); }}
                      className="w-5 h-5 rounded-full border border-[#D7DCD9] hover:scale-125 transition-transform shrink-0 shadow-sm" 
                      style={{ backgroundColor: color }} 
                      title={color === '#333333' ? '通常色' : color}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* WYSIWYG エディタ本体 */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[50vh] custom-scrollbar flex flex-col relative bg-[#FFFFFF] sm:rounded-b-2xl">
              <div className="flex-1 relative">
                <div className="space-y-0">
                  {Array.isArray(formData.blocks) && formData.blocks.map((block, index) => {
                    if (!block) return null;
                    return (
                      <div key={block.id || generateId()} className="flex items-start group relative">
                        <div className={`flex justify-center shrink-0 ${block.type === 'text' ? 'w-1 sm:w-0' : 'w-6 sm:w-7 pt-[6px]'}`}> 
                          {block.type === 'list' && <div className="text-[#666666] font-bold text-[18px]">•</div>}
                          {block.type === 'checkbox' && (
                            <div className="cursor-pointer" onClick={() => updateBlock(block.id, { checked: !block.checked })}>
                              {block.checked ? <CheckSquare className="w-5 h-5 text-[#00CC5B]" /> : <Square className="w-5 h-5 text-[#C4C4C4] hover:text-[#00CC5B]" />}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 pl-1 pr-6 sm:pr-8">
                          {block.type === 'image' ? (
                            <div className="relative inline-block my-2 w-full">
                              <img src={block.content} alt="添付画像" className="max-w-full max-h-[400px] object-contain rounded-lg border border-[#D7DCD9]" />
                              <button 
                                type="button" 
                                onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} 
                                className="absolute top-2 right-2 p-1.5 bg-[#FFFFFF]/80 hover:bg-[#FFFFFF] text-[#ED1C24] rounded-full shadow-sm transition-all z-20 backdrop-blur-sm border border-[#D7DCD9]/50" 
                                title="画像を削除"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          ) : (
                            <ContentEditableBlock
                              id={`block-input-${block.id}`}
                              html={block.content || ''}
                              onChange={(html) => updateBlock(block.id, html)}
                              onKeyDown={(e) => handleKeyDown(e, index, block.type, block.id)}
                              onPaste={(e) => handlePaste(e, block.id, index)}
                              className={`${block.type === 'checkbox' && block.checked ? 'text-[#666666] line-through' : 'text-[#333333]'} text-[13px] sm:text-[14px] leading-[1.6]`}
                              placeholder={block.type === 'text' ? (index === 0 ? "ここからメモを入力..." : "") : "項目を入力..."}
                            />
                          )}
                        </div>
                        
                        {block.type !== 'image' && (
                          <button 
                            type="button" 
                            onMouseDown={(e) => e.preventDefault()} 
                            onClick={() => removeBlock(block.id)} 
                            className="absolute right-0 top-1 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-[#C4C4C4] hover:text-[#ED1C24] hover:bg-[#F7F9F8] rounded transition-all z-10" 
                            title="この行を削除"
                          >
                            <X className="w-4 h-4 sm:w-5 h-5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* リンク集追加・編集モーダル */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#FFFFFF] rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-[18px] text-[#333333]">{linkFormData.id ? 'リンクを編集' : 'リンクを追加'}</h3>
              <button onClick={() => setIsLinkModalOpen(false)} className="text-[#666666] hover:bg-[#F7F9F8] p-1.5 rounded-lg"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[#666666]">登録ワード <span className="text-[#ED1C24]">*</span></label>
              <input type="text" value={linkFormData.word || ''} onChange={e => setLinkFormData({...linkFormData, word: e.target.value})} placeholder="例: デザインガイド" className="px-3 py-2 border border-[#D7DCD9] rounded-lg outline-none focus:border-[#00CC5B] text-[14px]" />
              <p className="text-[10px] text-[#666666]">メモ内にこのワードが含まれると自動でリンク化されます。</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[#666666]">URL <span className="text-[#ED1C24]">*</span></label>
              <input type="url" value={linkFormData.url || ''} onChange={e => setLinkFormData({...linkFormData, url: e.target.value})} placeholder="https://..." className="px-3 py-2 border border-[#D7DCD9] rounded-lg outline-none focus:border-[#00CC5B] text-[14px]" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[#666666]">カテゴリー（グループ）</label>
              <input type="text" value={linkFormData.groupName || ''} onChange={e => setLinkFormData({...linkFormData, groupName: e.target.value})} placeholder="例: 共有リンク、一般..." className="px-3 py-2 border border-[#D7DCD9] rounded-lg outline-none focus:border-[#00CC5B] text-[14px]" />
            </div>

            <div className="flex items-center justify-between mt-4">
              {linkFormData.id ? (
                <button onClick={() => requestDeleteLink(linkFormData.id)} className="text-[#ED1C24] hover:bg-[#FFE600]/30 px-3 py-2 rounded-lg text-[14px] font-bold transition-colors">削除</button>
              ) : <div></div>}
              <div className="flex items-center gap-2">
                <button onClick={() => setIsLinkModalOpen(false)} className="px-4 py-2 text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:bg-[#F7F9F8] rounded-lg font-bold text-[14px]">キャンセル</button>
                <button onClick={saveLink} disabled={!linkFormData.word || !linkFormData.url} className="px-5 py-2 bg-[#00CC5B] hover:bg-[#00AC4C] disabled:bg-[#C4C4C4] text-[#FFFFFF] rounded-lg font-bold text-[14px] transition-colors">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 確認ダイアログ */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-[#FFFFFF] rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-[#ED1C24]">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-bold text-[18px]">確認</h3>
            </div>
            <p className="text-[#333333] font-medium leading-[1.6]">{confirmDialog.message}</p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setConfirmDialog({ isOpen: false, message: '', targetId: null, actionType: null })} className="px-4 py-2 text-[#666666] hover:bg-[#F7F9F8] rounded-lg font-bold text-[14px] transition-colors border border-[#D7DCD9]">キャンセル</button>
              <button onClick={executeConfirmAction} className="px-4 py-2 bg-[#ED1C24] hover:bg-[#C81016] text-[#FFFFFF] rounded-lg font-bold text-[14px] transition-colors">削除する</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}