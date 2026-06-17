import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2, AlertCircle, LogOut, Calendar, Clock, PenTool, Menu, GripVertical, ZoomIn, ZoomOut, BookOpen, ExternalLink } from 'lucide-react';

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

// ★ URL自動リンク ＆ 辞書リンク解析コンポーネント
const LinkifiedText = ({ text, className, links = [], activeCategoryId }) => {
  const parseLinks = (str) => {
    const validLinks = links.filter(l => !l.groupName || l.groupName === 'すべて' || l.groupName === activeCategoryId);
    validLinks.sort((a, b) => b.word.length - a.word.length);

    const parts = [];
    let lastIndex = 0;
    let match;
    const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    
    while ((match = mdRegex.exec(str)) !== null) {
      if (match.index > lastIndex) parts.push({ type: 'text', content: str.substring(lastIndex, match.index) });
      parts.push({ type: 'link', text: match[1], url: match[2] });
      lastIndex = mdRegex.lastIndex;
    }
    if (lastIndex < str.length) parts.push({ type: 'text', content: str.substring(lastIndex) });
    
    let finalParts = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    parts.forEach(p => {
      if (p.type === 'link') {
        finalParts.push(p);
      } else {
        const subParts = p.content.split(urlRegex);
        subParts.forEach(sp => {
          if (urlRegex.test(sp)) finalParts.push({ type: 'link', text: sp, url: sp });
          else if (sp) finalParts.push({ type: 'text', content: sp });
        });
      }
    });

    if (validLinks.length > 0) {
      let wordParsedParts = [];
      finalParts.forEach(p => {
        if (p.type === 'link') {
          wordParsedParts.push(p);
        } else {
          const escapedWords = validLinks.map(l => l.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          const wordRegex = new RegExp(`(${escapedWords.join('|')})`, 'g');
          const subParts = p.content.split(wordRegex);
          subParts.forEach(sp => {
            if (!sp) return;
            const matchedLink = validLinks.find(l => l.word === sp);
            if (matchedLink) {
              wordParsedParts.push({ type: 'dict_link', text: sp, url: matchedLink.url });
            } else {
              wordParsedParts.push({ type: 'text', content: sp });
            }
          });
        }
      });
      finalParts = wordParsedParts;
    }

    return finalParts.map((p, i) => {
      if (p.type === 'link') {
        return <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-[#00CC5B] hover:text-[#00AC4C] hover:underline font-bold break-words" onClick={(e) => e.stopPropagation()}>{p.text}</a>;
      } else if (p.type === 'dict_link') {
        return <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-[#00CC5B] hover:text-[#00AC4C] hover:underline font-bold border-b-[2px] border-dotted border-[#00CC5B] break-words" onClick={(e) => e.stopPropagation()}>{p.text}</a>;
      } else {
        return <span key={i}>{p.content}</span>;
      }
    });
  };
  return <div className={className}>{parseLinks(text)}</div>;
};

const formatDueDate = (dateString) => {
  if (!dateString) return null;
  const d = new Date(dateString);
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

  // ★ 初期値を false に変更（ドロワーとして被さるため、最初は閉じておく）
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('all_list'); // 初期タブ
  const [notes, setNotes] = useState([]);
  const [links, setLinks] = useState([]);
  
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [], dueDate: '', x: 0, y: 0 });
  const fileInputRef = useRef(null);

  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
  const [dragOverIndicator, setDragOverIndicator] = useState(null);

  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [categoryDragOverIndicator, setCategoryDragOverIndicator] = useState(null);

  const [activeBlockId, setActiveBlockId] = useState(null);
  const activeBlockInfoRef = useRef({ id: null, cursorPosition: 0 });

  // リンク集用 State
  const [linkFilter, setLinkFilter] = useState('すべて');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkFormData, setLinkFormData] = useState({ id: '', word: '', url: '', groupName: 'すべて' });
  const [draggedLinkId, setDraggedLinkId] = useState(null);
  const [linkDragOverIndicator, setLinkDragOverIndicator] = useState(null);

  // フリーノート用 State
  const freenoteRef = useRef(null);
  const [canvasDragState, setCanvasDragState] = useState(null);
  const [freenoteZoom, setFreenoteZoom] = useState(1);

  const saveCursorPosition = (e, blockId) => {
    activeBlockInfoRef.current = { id: blockId, cursorPosition: e.target.selectionStart || 0 };
    setActiveBlockId(blockId);
  };

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(t => {
          t.style.height = 'auto';
          t.style.height = `${t.scrollHeight}px`;
        });
      }, 10);
    }
  }, [isModalOpen]);

  const handleTextareaResize = (e) => {
    const el = e.target;
    const container = el.closest('.overflow-y-auto');
    const currentScrollTop = container ? container.scrollTop : 0;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (container) container.scrollTop = currentScrollTop;
  };

  // フリーノートの初期表示を左上に設定
  useEffect(() => {
    if (activeCategoryId === 'freenote' && freenoteRef.current) {
      freenoteRef.current.scrollTop = 0;
      freenoteRef.current.scrollLeft = 0;
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
      const loadedCategories = snapshot.docs.map(d => d.data()).sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : a.createdAt;
        const orderB = b.order !== undefined ? b.order : b.createdAt;
        return orderA - orderB;
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
      const loadedNotes = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setNotes(loadedNotes);
      setLoading(false);
    });

    const unsubLinks = onSnapshot(linksRef, (snapshot) => {
      const loadedLinks = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setLinks(loadedLinks);
    });

    return () => { unsubCategories(); unsubNotes(); unsubLinks(); };
  }, [user]);

  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);
  const getLinkDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'links', id);

  const handleTabClick = (categoryId) => {
    setActiveCategoryId(categoryId);
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
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
  };

  const saveCategoryName = async (id) => {
    if (!user || editingCategoryName.trim() === '') return;
    await setDoc(getCategoryDoc(id), { name: editingCategoryName.trim() }, { merge: true });
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = async (id) => {
    if (!user || categories.length <= 1) return;
    await deleteDoc(getCategoryDoc(id));
    setActiveCategoryId('all_list');
  };

  const openAddModal = () => {
    setEditingNote(null);
    const initialCategory = (activeCategoryId === 'freenote' || activeCategoryId === 'deadline' || activeCategoryId === 'linkbook' || activeCategoryId === 'all_list') ? categories[0]?.id : activeCategoryId;
    setFormData({ title: '', categoryId: initialCategory, blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '' });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (note) => {
    setEditingNote(note);
    const initialBlocks = note.blocks || [{ id: generateId(), type: 'text', content: note.content || '', checked: false }];
    setFormData({ ...note, blocks: initialBlocks });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
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
    const note = notes.find(n => n.id === id);
    if (note) {
      setNotes(notes.map(n => n.id === id ? { ...n, isCompleted: !n.isCompleted } : n));
      await setDoc(getNoteDoc(id), { isCompleted: !note.isCompleted }, { merge: true });
    }
  };

  const handleBoardBlockCheckToggle = async (e, noteId, blockId) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === noteId);
    if (note) {
      const newBlocks = note.blocks.map(b => b.id === blockId ? { ...b, checked: !b.checked } : b);
      setNotes(notes.map(n => n.id === noteId ? { ...n, blocks: newBlocks } : n));
      await setDoc(getNoteDoc(noteId), { blocks: newBlocks }, { merge: true });
    }
  };

  // --- ドラッグ＆ドロップ（カテゴリー） ---
  const handleCategoryDragStart = (e, id) => {
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
      const sortedCategories = [...categories];
      const srcIdx = sortedCategories.findIndex(c => c.id === sourceCategoryId);
      if (srcIdx === -1) return;

      const [removed] = sortedCategories.splice(srcIdx, 1);
      const targetIdxAfterRemove = sortedCategories.findIndex(c => c.id === targetCategoryId);
      
      if (targetIdxAfterRemove === -1) {
        sortedCategories.push(removed);
      } else {
        const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
        sortedCategories.splice(insertIndex, 0, removed);
      }
      
      const updatedCategories = sortedCategories.map((c, index) => ({ ...c, order: (index + 1) * 1000 }));
      setCategories(updatedCategories);
      for (const c of updatedCategories) {
        await setDoc(getCategoryDoc(c.id), { order: c.order }, { merge: true });
      }
      return;
    }

    if (!sourceNoteId || targetCategoryId === activeCategoryId || !user) return;
    setNotes(notes.map(n => n.id === sourceNoteId ? { ...n, categoryId: targetCategoryId, order: Date.now() } : n));
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
    
    const categoryNotes = notes.filter(n => n.categoryId === activeCategoryId).sort((a,b) => a.order - b.order);
    const sourceIndex = categoryNotes.findIndex(n => n.id === sourceId);
    if (sourceIndex === -1) return;
    
    const newCategoryNotes = [...categoryNotes];
    const [removed] = newCategoryNotes.splice(sourceIndex, 1);
    
    const targetIdxAfterRemove = newCategoryNotes.findIndex(n => n.id === targetId);
    if (targetIdxAfterRemove === -1) return;
    
    const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
    newCategoryNotes.splice(insertIndex, 0, removed);
    
    const updatedNotes = newCategoryNotes.map((note, index) => ({ ...note, order: index * 1000 }));
    setNotes(prev => [...prev.filter(n => n.categoryId !== activeCategoryId), ...updatedNotes]);
    for (const note of updatedNotes) await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true });
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
    setNotes(prev => prev.map(n => n.id === canvasDragState.id ? { ...n, x: canvasDragState.initialX + dx, y: canvasDragState.initialY + dy } : n));
  };
  const handleFreenotePointerUp = async (e) => {
    if (!canvasDragState) return;
    const targetNote = notes.find(n => n.id === canvasDragState.id);
    setCanvasDragState(null);
    if (targetNote && user) await setDoc(getNoteDoc(targetNote.id), { x: targetNote.x, y: targetNote.y }, { merge: true });
  };
  
  const handleFreenoteDoubleClick = (e) => {
    if (!e.target.className.includes('pointer-events-auto') && !e.target.className.includes('radial-gradient')) return;
    const rect = freenoteRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left + freenoteRef.current.scrollLeft) / freenoteZoom;
    const y = (e.clientY - rect.top + freenoteRef.current.scrollTop) / freenoteZoom;
    
    setEditingNote(null);
    setFormData({ title: '', categoryId: 'freenote', blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '', x, y });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
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

    const currentLinks = linkFilter === 'すべて' ? links : links.filter(l => (l.groupName || 'すべて') === linkFilter);
    const sortedCurrentLinks = currentLinks.sort((a,b) => a.order - b.order);
    
    const sourceIdx = sortedCurrentLinks.findIndex(l => l.id === sourceId);
    if (sourceIdx === -1) return;

    const newLinks = [...sortedCurrentLinks];
    const [removed] = newLinks.splice(sourceIdx, 1);
    
    const targetIdxAfterRemove = newLinks.findIndex(l => l.id === targetId);
    if (targetIdxAfterRemove === -1) {
      newLinks.push(removed);
    } else {
      const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
      newLinks.splice(insertIndex, 0, removed);
    }

    const updatedLinks = newLinks.map((l, i) => ({ ...l, order: i * 1000 }));
    setLinks(prev => [...prev.filter(l => !updatedLinks.find(ul => ul.id === l.id)), ...updatedLinks]);
    
    for (const l of updatedLinks) await setDoc(getLinkDoc(l.id), { order: l.order }, { merge: true });
  };
  const handleLinkDragEnd = () => {
    setDraggedLinkId(null);
    setLinkDragOverIndicator(null);
  };

  const saveLink = async () => {
    if (!user || !linkFormData.word || !linkFormData.url) return;
    const id = linkFormData.id || generateId();
    await setDoc(getLinkDoc(id), { ...linkFormData, id, order: linkFormData.order || Date.now() }, { merge: true });
    setIsLinkModalOpen(false);
  };

  const deleteLink = async (id) => {
    if (!user) return;
    await deleteDoc(getLinkDoc(id));
    setIsLinkModalOpen(false);
  };

  // --- ブロックエディタ ---
  const addBlock = (type) => {
    setFormData(prev => {
      const { id: targetId, cursorPosition } = activeBlockInfoRef.current;
      const activeIdx = prev.blocks.findIndex(b => b.id === targetId);

      if (activeIdx !== -1 && prev.blocks[activeIdx].type === 'text') {
        const targetBlock = prev.blocks[activeIdx];
        const textBefore = targetBlock.content.substring(0, cursorPosition);
        const textAfter = targetBlock.content.substring(cursorPosition);

        const newBlockId = generateId();
        const newTextId = generateId();
        const newBlocks = [...prev.blocks];

        newBlocks[activeIdx] = { ...targetBlock, content: textBefore };
        newBlocks.splice(activeIdx + 1, 0, 
          { id: newBlockId, type, content: '', checked: false },
          { id: newTextId, type: 'text', content: textAfter, checked: false }
        );

        setTimeout(() => { const el = document.getElementById(`block-input-${newBlockId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newBlockId, cursorPosition: 0 };
        setActiveBlockId(newBlockId);
        return { ...prev, blocks: newBlocks };
      } else {
        const newId = generateId();
        const insertIdx = activeIdx !== -1 ? activeIdx + 1 : prev.blocks.length;
        const newBlocks = [...prev.blocks];
        newBlocks.splice(insertIdx, 0, { id: newId, type, content: '', checked: false });
        
        setTimeout(() => { const el = document.getElementById(`block-input-${newId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newId, cursorPosition: 0 };
        setActiveBlockId(newId);
        return { ...prev, blocks: newBlocks };
      }
    });
  };

  const updateBlock = (blockId, updates) => setFormData(prev => ({ ...prev, blocks: prev.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }));
  const removeBlock = (blockId) => setFormData(prev => ({ ...prev, blocks: prev.blocks.filter(b => b.id !== blockId) }));

  const handleKeyDown = (e, index, blockType) => {
    if (e.nativeEvent.isComposing) return;
    
    if (e.key === 'Backspace' && formData.blocks[index].content === '') {
      e.preventDefault();
      if (formData.blocks.length > 1) {
        removeBlock(formData.blocks[index].id);
        if (index > 0) {
          const prevBlock = formData.blocks[index - 1];
          setTimeout(() => {
            const prevInput = document.getElementById(`block-input-${prevBlock.id}`);
            if (prevInput) {
              prevInput.focus();
              const len = prevInput.value.length;
              prevInput.setSelectionRange(len, len);
            }
          }, 10);
          activeBlockInfoRef.current = { id: prevBlock.id, cursorPosition: prevBlock.content.length };
          setActiveBlockId(prevBlock.id);
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (blockType === 'list' || blockType === 'checkbox') {
        e.preventDefault();
        const newId = generateId();
        const newBlock = { id: newId, type: blockType, content: '', checked: false };
        const newBlocks = [...formData.blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        setFormData({ ...formData, blocks: newBlocks });
        
        setTimeout(() => { const el = document.getElementById(`block-input-${newId}`); if (el) el.focus(); }, 10);
        activeBlockInfoRef.current = { id: newId, cursorPosition: 0 };
        setActiveBlockId(newId);
      }
    }
  };

  const insertContentIntoText = (contentData, type) => {
    setFormData(prev => {
      const { id: targetId, cursorPosition } = activeBlockInfoRef.current;
      const activeIdx = prev.blocks.findIndex(b => b.id === targetId);

      if (activeIdx !== -1 && prev.blocks[activeIdx].type === 'text') {
        const targetBlock = prev.blocks[activeIdx];
        const textBefore = targetBlock.content.substring(0, cursorPosition);
        const textAfter = targetBlock.content.substring(cursorPosition);

        const newContentId = generateId();
        const newTextId = generateId();
        const newBlocks = [...prev.blocks];

        newBlocks[activeIdx] = { ...targetBlock, content: textBefore };
        
        if (type === 'image') {
          newBlocks.splice(activeIdx + 1, 0, { id: newContentId, type: 'image', content: contentData }, { id: newTextId, type: 'text', content: textAfter, checked: false });
        } else if (type === 'text') {
          const combinedContent = textBefore + contentData + textAfter;
          newBlocks[activeIdx] = { ...targetBlock, content: combinedContent };
          activeBlockInfoRef.current = { id: targetId, cursorPosition: cursorPosition + contentData.length };
          return { ...prev, blocks: newBlocks };
        }

        setTimeout(() => { const el = document.getElementById(`block-input-${newTextId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
        setActiveBlockId(newTextId);
        return { ...prev, blocks: newBlocks };
      } else {
        const newContentId = generateId();
        const newTextId = generateId();
        const insertIdx = activeIdx !== -1 ? activeIdx + 1 : prev.blocks.length;
        const newBlocks = [...prev.blocks];
        
        if (type === 'image') {
          newBlocks.splice(insertIdx, 0, { id: newContentId, type: 'image', content: contentData }, { id: newTextId, type: 'text', content: '', checked: false });
        }
        
        setTimeout(() => { const el = document.getElementById(`block-input-${newTextId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
        setActiveBlockId(newTextId);
        return { ...prev, blocks: newBlocks };
      }
    });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result);
      insertContentIntoText(compressedUrl, 'image');
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handlePaste = async (e) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const files = Array.from(clipboardData.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      e.preventDefault();
      const file = imageFiles[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressedUrl = await compressImage(reader.result);
        insertContentIntoText(compressedUrl, 'image');
      };
      reader.readAsDataURL(file);
      return;
    }

    const items = Array.from(clipboardData.items || []);
    const imageItems = items.filter(i => i.type.startsWith('image/'));
    if (imageItems.length > 0) {
      const file = imageItems[0].getAsFile();
      if (file) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressedUrl = await compressImage(reader.result);
          insertContentIntoText(compressedUrl, 'image');
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    const html = clipboardData.getData('text/html');
    if (html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const imgs = doc.querySelectorAll('img');
      if (imgs.length > 0) {
        const src = imgs[0].src;
        if (src.startsWith('data:image/')) {
          e.preventDefault();
          insertContentIntoText(src, 'image');
          return;
        }
      }

      if (html.includes('<a ')) {
        const links = doc.querySelectorAll('a');
        if (links.length > 0) {
          e.preventDefault();
          links.forEach(a => {
              const md = `[${a.textContent}](${a.href})`;
              a.replaceWith(document.createTextNode(md));
          });
          const plainText = doc.body.textContent || "";
          insertContentIntoText(plainText, 'text');
        }
      }
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

  let activeNotes = [];
  if (activeCategoryId === 'all_list') {
    activeNotes = notes.filter(n => showCompleted ? true : !n.isCompleted);
  } else if (activeCategoryId === 'deadline') {
    activeNotes = notes.filter(n => n.dueDate && (showCompleted ? true : !n.isCompleted)).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
  } else if (activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook') {
    activeNotes = notes.filter(n => n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted));
  }

  const dueDateParts = getDueDateParts(formData.dueDate);
  const handleDateChange = (type, val) => {
    const newDateStr = type === 'date' ? val : (dueDateParts.date || new Date().toISOString().split('T')[0]);
    const newHour = type === 'hour' ? val : dueDateParts.hour;
    const newMinute = type === 'minute' ? val : dueDateParts.minute;
    if (newDateStr) {
      const dt = new Date(`${newDateStr}T${newHour}:${newMinute}:00`);
      if (!isNaN(dt.getTime())) setFormData({...formData, dueDate: dt.toISOString()});
    }
  };

  const linkGroups = ['すべて', ...Array.from(new Set(links.map(l => l.groupName).filter(Boolean)))];
  if (!linkGroups.includes('一般')) linkGroups.push('一般');
  const filteredLinks = linkFilter === 'すべて' ? links : links.filter(l => (l.groupName || '一般') === linkFilter);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9F8] text-[#333333]">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700&family=Roboto:wght@500;700&display=swap');
        body { font-family: 'Roboto', 'Noto Sans JP', sans-serif; font-weight: 500; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #D7DCD9; border-radius: 20px; }
      `}} />

      {/* サイドバー（ドロワー）オーバーレイ背景 */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-[#333333]/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

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
              <button onClick={handleAddCategory} className="hover:text-[#00CC5B] transition-colors"><Plus className="w-4 h-4"/></button>
            </div>

            {categories.map(category => (
              <div
                key={category.id}
                draggable
                onDragStart={(e) => handleCategoryDragStart(e, category.id)}
                onDragEnd={handleCategoryDragEnd}
                onClick={() => handleTabClick(category.id)}
                onDragOver={(e) => handleCategoryDragOver(e, category.id)}
                onDragLeave={() => { setDragOverCategoryId(null); setCategoryDragOverIndicator(null); }}
                onDrop={(e) => handleCategoryDrop(e, category.id)}
                className={`flex items-center gap-[8px] px-3 py-2 rounded-xl transition-colors cursor-pointer group relative
                  ${activeCategoryId === category.id ? 'bg-[#E0FFEE] text-[#00CC5B]' : dragOverCategoryId === category.id ? 'bg-[#E0FFEE] text-[#00AC4C] border border-[#00CC5B] scale-105' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}
                `}
              >
                {categoryDragOverIndicator?.id === category.id && categoryDragOverIndicator?.position === 'top' && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#00CC5B] rounded-full z-10 -mt-[2px]"></div>
                )}
                {categoryDragOverIndicator?.id === category.id && categoryDragOverIndicator?.position === 'bottom' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#00CC5B] rounded-full z-10 -mb-[2px]"></div>
                )}
                {editingCategoryId === category.id ? (
                  <input type="text" value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onBlur={() => saveCategoryName(category.id)} onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)} autoFocus className="border border-[#00CC5B] rounded px-2 py-0.5 text-[14px] outline-none bg-[#FFFFFF] w-full" />
                ) : (
                  <>
                    <GripVertical className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 shrink-0 cursor-grab active:cursor-grabbing"/>
                    <span className="font-bold text-[14px] select-none flex-1 truncate">{category.name}</span>
                    {activeCategoryId === category.id && (
                      <div className="flex items-center ml-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="p-1 text-[#666666] hover:text-[#00CC5B] transition-colors rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        {categories.length > 1 && <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }} className="p-1 text-[#666666] hover:text-[#ED1C24] transition-colors rounded"><X className="w-3.5 h-3.5" /></button>}
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

      {/* メイン画面（★ 押し出されないように w-full に変更） */}
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden relative">
        {/* ヘッダー */}
        <header className="bg-[#FFFFFF] border-b border-[#D7DCD9] h-16 flex items-center justify-between px-4 sm:px-6 shrink-0 z-10">
          <div className="flex items-center">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 mr-2 text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333] rounded-lg transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-[18px] sm:text-[20px] font-bold text-[#333333]">
              {activeCategoryId === 'freenote' ? 'フリーノート' : activeCategoryId === 'deadline' ? '期限付きメモ' : activeCategoryId === 'linkbook' ? 'リンク集' : activeCategoryId === 'all_list' ? 'すべてのメモ' : categories.find(c => c.id === activeCategoryId)?.name}
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
            <div className="max-w-7xl mx-auto h-full p-4 sm:p-6 flex flex-col">
              <div className="bg-[#FFFFFF] rounded-xl shadow-sm border border-[#D7DCD9] overflow-hidden flex flex-col flex-1">
                <div className="overflow-y-auto custom-scrollbar flex-1">
                  <table className="w-full text-left text-[#333333] text-[13px] sm:text-[14px]">
                    <thead className="bg-[#F7F9F8] sticky top-0 z-10 border-b border-[#D7DCD9]">
                      <tr>
                        <th className="px-4 py-3 font-bold w-12 text-center">完了</th>
                        <th className="px-4 py-3 font-bold">タイトル</th>
                        <th className="px-4 py-3 font-bold">ボード名</th>
                        <th className="px-4 py-3 font-bold">期限</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeNotes.map(note => {
                        const catName = note.categoryId === 'freenote' ? 'フリーノート' : categories.find(c => c.id === note.categoryId)?.name || '不明';
                        const dueDateInfo = formatDueDate(note.dueDate);
                        return (
                          <tr key={note.id} onClick={() => openEditModal(note)} className="border-b border-[#D7DCD9] hover:bg-[#F7F9F8] cursor-pointer transition-colors group">
                            <td className="px-4 py-3 text-center" onClick={(e) => { e.stopPropagation(); toggleComplete(e, note.id); }}>
                              {note.isCompleted ? <CheckCircle2 className="w-5 h-5 text-[#00CC5B] mx-auto" /> : <Circle className="w-5 h-5 text-[#C4C4C4] group-hover:text-[#00CC5B] mx-auto" />}
                            </td>
                            <td className={`px-4 py-3 font-bold ${note.isCompleted ? 'text-[#666666] line-through' : ''}`}>
                              {note.title || '無題'}
                            </td>
                            <td className="px-4 py-3 text-[#666666] whitespace-nowrap">
                              {catName}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {dueDateInfo ? (
                                <span className={`px-2 py-1 rounded text-[12px] font-bold ${dueDateInfo.isPast && !note.isCompleted ? 'bg-[#FFE600]/30 text-[#ED1C24]' : 'bg-[#E0FFEE] text-[#00AC4C]'}`}>
                                  {dueDateInfo.text}
                                </span>
                              ) : (
                                <span className="text-[#C4C4C4]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {activeNotes.length === 0 && <div className="p-8 text-center text-[#666666] font-medium">メモがありません。</div>}
                </div>
              </div>
            </div>
          )}

          {activeCategoryId === 'freenote' && (
            <>
              <div className="w-full h-full overflow-auto custom-scrollbar" ref={freenoteRef} onDoubleClick={handleFreenoteDoubleClick}>
                <div style={{ width: 5000 * freenoteZoom, height: 5000 * freenoteZoom, backgroundImage: 'radial-gradient(#D7DCD9 2px, transparent 2px)', backgroundSize: `${30 * freenoteZoom}px ${30 * freenoteZoom}px` }} className="relative pointer-events-none origin-top-left">
                  <div className="pointer-events-auto" style={{ transform: `scale(${freenoteZoom})`, transformOrigin: '0 0', width: 5000, height: 5000 }}>
                    {notes.filter(n => n.categoryId === 'freenote').map(note => (
                      <div 
                        key={note.id}
                        style={{ position: 'absolute', left: note.x || 40, top: note.y || 40, width: 320 }}
                        onPointerDown={(e) => handleFreenotePointerDown(e, note)}
                        onPointerMove={handleFreenotePointerMove}
                        onPointerUp={handleFreenotePointerUp}
                        onPointerCancel={handleFreenotePointerUp}
                        className="bg-[#FFFFFF] rounded-xl border border-[#D7DCD9] shadow-md touch-none cursor-grab active:cursor-grabbing hover:border-[#00CC5B] transition-colors z-0 hover:z-10"
                      >
                        <div className="p-3">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-[#333333] text-[14px] truncate pr-2 leading-[1.6]">{note.title || '無題'}</h3>
                            <button onClick={(e) => { e.stopPropagation(); openEditModal(note); }} className="no-drag p-1 text-[#666666] hover:text-[#00CC5B] bg-[#F7F9F8] rounded-md shrink-0"><Edit2 className="w-4 h-4"/></button>
                          </div>
                          <div className="max-h-[400px] overflow-hidden relative no-drag text-[12px]">
                            {/* 最大20行に変更 */}
                            {note.blocks?.slice(0, 20).map(block => (
                              <div key={block.id} className="py-0.5">
                                {block.type === 'text' && <div className="text-[#666666] leading-[1.6] whitespace-pre-wrap"><LinkifiedText text={block.content} links={links} activeCategoryId={note.categoryId} /></div>}
                                {block.type === 'list' && <div className="text-[#666666] flex items-start gap-1 leading-[1.6]"><span className="text-[#666666] font-bold mt-[2px] shrink-0">•</span><span className="whitespace-pre-wrap"><LinkifiedText text={block.content} links={links} activeCategoryId={note.categoryId} /></span></div>}
                                {block.type === 'checkbox' && (
                                  <div className="flex items-start gap-[4px] leading-[1.6]">
                                    {block.checked ? <CheckCircle2 className="w-3.5 h-3.5 text-[#00CC5B] mt-[2px] flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 text-[#C4C4C4] mt-[2px] flex-shrink-0" />}
                                    <span className={`${block.checked ? 'line-through text-[#666666]' : 'text-[#666666]'} whitespace-pre-wrap`}>
                                      <LinkifiedText text={block.content} links={links} activeCategoryId={note.categoryId} />
                                    </span>
                                  </div>
                                )}
                                {block.type === 'image' && (
                                  <div className="my-1.5 rounded-lg overflow-hidden border border-[#D7DCD9] bg-[#F7F9F8] flex items-center justify-center opacity-90 max-h-32">
                                    <img src={block.content} alt="サムネイル" className="max-w-full max-h-32 object-contain" />
                                  </div>
                                )}
                              </div>
                            ))}
                            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#FFFFFF] to-transparent pointer-events-none"></div>
                          </div>
                        </div>
                      </div>
                    ))}
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
                {filteredLinks.map(link => (
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
                      <div className="font-bold text-[#333333] text-[16px] truncate">{link.word}</div>
                      <div className="text-[12px] text-[#00CC5B] bg-[#E0FFEE] px-2 py-0.5 rounded shrink-0">{link.groupName || '一般'}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-[#F7F9F8] hover:bg-[#E0FFEE] hover:text-[#00CC5B] text-[#666666] rounded-md transition-colors text-[12px] font-bold">
                        開く <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => { setLinkFormData(link); setIsLinkModalOpen(true); }} className="p-1.5 text-[#C4C4C4] hover:text-[#00CC5B] transition-colors"><Edit2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                ))}
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
              {activeNotes.length === 0 ? (
                <div onClick={() => openAddModal()} className="text-center py-16 border-2 border-dashed border-[#D7DCD9] rounded-2xl text-[#666666] hover:border-[#00CC5B] hover:text-[#00AC4C] transition-colors cursor-pointer max-w-lg mx-auto mt-10">
                  <div className="text-[18px] font-bold mb-2">メモがありません</div>
                  <div className="text-[14px] font-medium">＋ ここをクリックして新しいメモを追加</div>
                </div>
              ) : (
                <div className="columns-2 lg:columns-3 xl:columns-4 gap-3 sm:gap-6 pb-10">
                  {activeNotes.map((note) => {
                    const dueDateInfo = formatDueDate(note.dueDate);
                    return (
                      <div
                        id={`note-${note.id}`}
                        key={note.id}
                        draggable={activeCategoryId !== 'deadline'}
                        onDragStart={(e) => handleDragStart(e, note.id)}
                        onDragEnd={(e) => handleDragEnd(e, note.id)}
                        onDragOver={(e) => handleDragOverNote(e, note.id)}
                        onDragLeave={handleDragLeaveNote}
                        onDrop={(e) => handleDropOnNote(e, note.id)}
                        onClick={() => openEditModal(note)}
                        className={`break-inside-avoid mb-3 sm:mb-6 group rounded-xl p-3 transition-all cursor-pointer relative bg-[#FFFFFF] border shadow-sm
                          ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'top' ? 'border-t-[4px] border-t-[#00CC5B] border-b-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                          ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'bottom' ? 'border-b-[4px] border-b-[#00CC5B] border-t-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                          ${!dragOverIndicator || dragOverIndicator.id !== note.id ? 'border-[#D7DCD9] hover:border-[#00CC5B] hover:shadow-md' : ''}
                          ${note.isCompleted ? 'opacity-60 bg-[#F7F9F8]' : ''}
                        `}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 min-w-0 pr-2">
                            {dueDateInfo && !note.isCompleted && (
                              <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 w-fit mb-1.5 ${dueDateInfo.isPast ? 'bg-[#FFE600]/30 text-[#ED1C24]' : 'bg-[#E0FFEE] text-[#00AC4C]'}`}>
                                <Clock className="w-2.5 h-2.5" /> {dueDateInfo.text}
                              </div>
                            )}
                            <h3 className={`font-bold text-[14px] truncate leading-[1.6] ${note.isCompleted ? 'text-[#666666] line-through' : 'text-[#333333]'}`}>
                              {note.title || '無題'}
                            </h3>
                          </div>
                          <button onClick={(e) => toggleComplete(e, note.id)} className={`shrink-0 transition-colors p-1 rounded-full shadow-sm border z-10 ${note.isCompleted ? 'text-[#00CC5B] bg-[#E0FFEE] border-[#00CC5B]' : 'text-[#C4C4C4] bg-[#FFFFFF] border-[#D7DCD9]'}`}>
                            {note.isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4 hover:text-[#00CC5B]" />}
                          </button>
                        </div>
                        
                        <div className="max-h-[400px] overflow-hidden relative text-[12px]">
                          {note.blocks?.slice(0, 20).map(block => (
                            <div key={block.id} className="py-0.5">
                              {block.type === 'text' && <div className={`leading-[1.6] whitespace-pre-wrap ${note.isCompleted ? 'text-[#666666]' : 'text-[#666666]'}`}><LinkifiedText text={block.content} links={links} activeCategoryId={note.categoryId} /></div>}
                              {block.type === 'list' && (
                                <div className={`flex items-start gap-[4px] leading-[1.6] ${note.isCompleted ? 'text-[#666666]' : 'text-[#666666]'}`}>
                                  <span className="font-bold mt-[2px] shrink-0">•</span><span><LinkifiedText text={block.content} links={links} activeCategoryId={note.categoryId} /></span>
                                </div>
                              )}
                              {block.type === 'checkbox' && (
                                <div className="flex items-start gap-[4px] cursor-pointer group/check leading-[1.6]" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                  {block.checked ? <CheckCircle2 className="w-3.5 h-3.5 text-[#00CC5B] mt-[2px] flex-shrink-0 group-hover/check:opacity-70" /> : <Circle className="w-3.5 h-3.5 text-[#C4C4C4] mt-[2px] flex-shrink-0 group-hover/check:text-[#00CC5B]" />}
                                  <span className={`${block.checked || note.isCompleted ? 'line-through text-[#666666]' : 'text-[#666666]'}`}>
                                    <LinkifiedText text={block.content} links={links} activeCategoryId={note.categoryId} />
                                  </span>
                                </div>
                              )}
                              {block.type === 'image' && (
                                <div className="my-1.5 rounded-lg overflow-hidden border border-[#D7DCD9] bg-[#F7F9F8] flex items-center justify-center opacity-90 max-h-32">
                                  <img src={block.content} alt="サムネイル" className="max-w-full max-h-32 object-contain" />
                                </div>
                              )}
                            </div>
                          ))}
                          <div className={`absolute bottom-0 left-0 right-0 h-8 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-[#F7F9F8] to-transparent' : 'bg-gradient-to-t from-[#FFFFFF] to-transparent'}`}></div>
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
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#FFFFFF] sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-[95vh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#D7DCD9] bg-[#F7F9F8] sm:rounded-t-2xl shrink-0 flex flex-col gap-3 z-10 relative">
              <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2">
                <div className="flex-1 flex flex-wrap items-center gap-[8px] min-w-[200px]">
                  <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="flex-1 min-w-[150px] px-1 py-1 text-[18px] sm:text-[20px] font-bold text-[#333333] bg-transparent border-b-[2px] border-transparent hover:border-[#D7DCD9] focus:border-[#00CC5B] outline-none transition-colors placeholder:text-[#666666]" placeholder="タイトル" />
                  
                  <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#D7DCD9] rounded-lg px-2 py-1.5 focus-within:border-[#00CC5B] transition-colors shrink-0">
                    <Calendar className="w-4 h-4 text-[#666666] hidden sm:block" />
                    <input type="date" value={dueDateParts.date} onChange={(e) => handleDateChange('date', e.target.value)} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium" />
                    <select value={dueDateParts.hour} onChange={(e) => handleDateChange('hour', e.target.value)} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium appearance-none">
                      {[...Array(24)].map((_, i) => { const h = String(i).padStart(2, '0'); return <option key={h} value={h}>{h}</option>; })}
                    </select>
                    <span className="text-[#666666]">:</span>
                    <select value={dueDateParts.minute} onChange={(e) => handleDateChange('minute', e.target.value)} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium appearance-none">
                      <option value="00">00</option>
                      <option value="15">15</option>
                      <option value="30">30</option>
                      <option value="45">45</option>
                    </select>
                  </div>

                  <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-24 sm:w-32 px-2 sm:px-3 py-1.5 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] bg-[#FFFFFF] text-[12px] sm:text-[14px] text-[#333333] shrink-0 font-medium">
                    <option value="freenote">フリーノート</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  {editingNote && <button type="button" onClick={() => deleteNote(editingNote.id)} className="text-[#666666] hover:text-[#ED1C24] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>}
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-[#666666] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-[4px] sm:gap-[8px]">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('text')} title="テキストを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><AlignLeft className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('list')} title="リストを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><List className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('checkbox')} title="チェックボックスを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><CheckSquare className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()} title="画像を追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><ImageIcon className="w-5 h-5" /></button>
                  <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                </div>
                <div className="flex items-center gap-[8px]">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 sm:px-4 sm:py-2 text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:bg-[#E0FFEE] hover:text-[#00AC4C] hover:border-[#00CC5B] rounded-lg font-bold transition-colors text-[12px] sm:text-[14px]">キャンセル</button>
                  <button type="button" onClick={saveNote} className="px-3 py-1.5 sm:px-5 sm:py-2 bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] rounded-lg font-bold transition-colors flex items-center gap-[4px] text-[12px] sm:text-[14px]"><Check className="w-4 h-4" /> 保存</button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[50vh] custom-scrollbar flex flex-col relative bg-[#FFFFFF] sm:rounded-b-2xl">
              <div className="flex-1 relative">
                <div className="space-y-0">
                  {formData.blocks?.map((block, index) => (
                    <div key={block.id} className="flex items-start group relative">
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
                          <textarea
                            id={`block-input-${block.id}`}
                            value={block.content}
                            onChange={(e) => { handleTextareaResize(e); updateBlock(block.id, { content: e.target.value }); saveCursorPosition(e, block.id); }}
                            onKeyDown={(e) => { handleKeyDown(e, index, block.type); saveCursorPosition(e, block.id); }}
                            onKeyUp={(e) => saveCursorPosition(e, block.id)}
                            onClick={(e) => saveCursorPosition(e, block.id)}
                            onFocus={(e) => saveCursorPosition(e, block.id)}
                            onPaste={handlePaste}
                            className={`w-full bg-transparent resize-none outline-none py-0.5 m-0 font-medium leading-[1.6] overflow-hidden min-h-[28px]
                              ${block.type === 'checkbox' && block.checked ? 'text-[#666666] line-through' : 'text-[#333333]'} text-[13px] sm:text-[14px]`}
                            rows={1}
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
                  ))}
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
              <input type="text" value={linkFormData.word} onChange={e => setLinkFormData({...linkFormData, word: e.target.value})} placeholder="例: デザインガイド" className="px-3 py-2 border border-[#D7DCD9] rounded-lg outline-none focus:border-[#00CC5B] text-[14px]" />
              <p className="text-[10px] text-[#666666]">メモ内にこのワードが含まれると自動でリンク化されます。</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[#666666]">URL <span className="text-[#ED1C24]">*</span></label>
              <input type="url" value={linkFormData.url} onChange={e => setLinkFormData({...linkFormData, url: e.target.value})} placeholder="https://..." className="px-3 py-2 border border-[#D7DCD9] rounded-lg outline-none focus:border-[#00CC5B] text-[14px]" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[#666666]">カテゴリー（グループ）</label>
              <input type="text" value={linkFormData.groupName} onChange={e => setLinkFormData({...linkFormData, groupName: e.target.value})} placeholder="例: 共有リンク、一般..." className="px-3 py-2 border border-[#D7DCD9] rounded-lg outline-none focus:border-[#00CC5B] text-[14px]" />
            </div>

            <div className="flex items-center justify-between mt-4">
              {linkFormData.id ? (
                <button onClick={() => deleteLink(linkFormData.id)} className="text-[#ED1C24] hover:bg-[#FFE600]/30 px-3 py-2 rounded-lg text-[14px] font-bold transition-colors">削除</button>
              ) : <div></div>}
              <div className="flex items-center gap-2">
                <button onClick={() => setIsLinkModalOpen(false)} className="px-4 py-2 text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:bg-[#F7F9F8] rounded-lg font-bold text-[14px]">キャンセル</button>
                <button onClick={saveLink} disabled={!linkFormData.word || !linkFormData.url} className="px-5 py-2 bg-[#00CC5B] hover:bg-[#00AC4C] disabled:bg-[#C4C4C4] text-[#FFFFFF] rounded-lg font-bold text-[14px] transition-colors">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}