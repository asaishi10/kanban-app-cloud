import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2, AlertCircle, LogOut, Calendar, Clock, PenTool, GripVertical, Menu, BookOpen, ZoomIn, ZoomOut, Link } from 'lucide-react';

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

const processRegex = (parts, regex, createNode) => {
  const newParts = [];
  parts.forEach(p => {
    if (p.type !== 'text') { newParts.push(p); return; }
    let lastIndex = 0;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(p.content)) !== null) {
      if (match.index > lastIndex) newParts.push({ type: 'text', content: p.content.substring(lastIndex, match.index) });
      newParts.push(createNode(match));
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < p.content.length) newParts.push({ type: 'text', content: p.content.substring(lastIndex) });
  });
  return newParts;
};

// Markdown、URL、および辞書単語を解析してリンク化する
const LinkifiedText = ({ text, className, links }) => {
  const parseLinks = (str) => {
    let parts = [{ type: 'text', content: str }];

    // Markdownリンク
    const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    parts = processRegex(parts, mdRegex, (match) => ({ type: 'link', text: match[1], url: match[2] }));

    // 生URL
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    parts = processRegex(parts, urlRegex, (match) => ({ type: 'link', text: match[1], url: match[1] }));

    // 辞書リンク
    if (links && links.length > 0) {
      const sortedLinks = [...links].sort((a, b) => b.word.length - a.word.length);
      sortedLinks.forEach(linkObj => {
        if (!linkObj.word) return;
        const escapedWord = linkObj.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordRegex = new RegExp(`(${escapedWord})`, 'g');
        parts = processRegex(parts, wordRegex, (match) => ({ type: 'link', text: match[1], url: linkObj.url, isDict: true }));
      });
    }

    return parts.map((p, i) => 
      p.type === 'link' ? (
        <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className={`hover:underline font-bold break-words ${p.isDict ? 'text-[#00CC5B] border-b border-dashed border-[#00CC5B]' : 'text-[#5C80FF]'}`} onClick={(e) => e.stopPropagation()}>
          {p.text}
        </a>
      ) : (
        <span key={i}>{p.content}</span>
      )
    );
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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // データ用ステート
  const [categories, setCategories] = useState([]);
  const [notes, setNotes] = useState([]);
  const [links, setLinks] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('freenote');
  const [showCompleted, setShowCompleted] = useState(false);

  // レイアウト用ステート
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [zoom, setZoom] = useState(100);

  // カテゴリー編集
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // リンク集用ステート
  const [linkFilter, setLinkFilter] = useState('すべて');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkFormData, setLinkFormData] = useState({ id: '', word: '', url: '', groupName: '一般' });

  // エディタ・モーダル用ステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [], dueDate: '', x: 40, y: 40 });
  const fileInputRef = useRef(null);

  // カーソル・フォーカス用
  const [activeBlockId, setActiveBlockId] = useState(null);
  const activeBlockInfoRef = useRef({ id: null, cursorPosition: 0 });

  // D&D インジケーター用
  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
  const [dragOverIndicator, setDragOverIndicator] = useState(null);
  
  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [categoryDragOverIndicator, setCategoryDragOverIndicator] = useState(null);

  const [draggedLinkId, setDraggedLinkId] = useState(null);
  const [linkDragOverIndicator, setLinkDragOverIndicator] = useState(null);

  // フリーノートキャンバス用
  const freenoteRef = useRef(null);
  const [canvasDragState, setCanvasDragState] = useState(null);

  const saveCursorPosition = (e, blockId) => {
    activeBlockInfoRef.current = { id: blockId, cursorPosition: e.target.selectionStart || 0 };
    setActiveBlockId(blockId);
  };

  // ★ 修正1: 毎回の入力で全テキストエリアの高さが再計算されてスクロールが飛ぶ問題を修正
  // [isModalOpen, formData.blocks] から formData.blocks を削除し、モーダルを開いた時だけ実行するようにします
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

  useEffect(() => {
    if (!user || !isConfigValid) { setCategories([]); setNotes([]); setLinks([]); return; }
    const categoriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'categories');
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const linksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'links');
    
    let isInitialCategoryLoad = true;

    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const loadedCategories = snapshot.docs.map(d => d.data()).sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : a.createdAt;
        const orderB = b.order !== undefined ? b.order : b.createdAt;
        return orderA - orderB;
      });
      if (loadedCategories.length === 0 && isInitialCategoryLoad) {
        const defaultId = generateId();
        const now = Date.now();
        setDoc(doc(categoriesRef, defaultId), { id: defaultId, name: 'メインボード', createdAt: now, order: now });
      } else {
        setCategories(loadedCategories);
      }
      isInitialCategoryLoad = false;
    });

    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      setNotes(snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order));
      setLoading(false);
    });

    const unsubLinks = onSnapshot(linksRef, (snapshot) => {
      setLinks(snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order));
    });

    return () => { unsubCategories(); unsubNotes(); unsubLinks(); };
  }, [user]);

  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);
  const getLinkDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'links', id);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error.code === 'auth/unauthorized-domain') alert(`【エラー】Firebase Consoleにて承認済みドメインを追加してください。\n${window.location.hostname}`);
      else alert("ログインに失敗しました。");
      setLoading(false);
    }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch (e) {} };

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
    handleTabClick('freenote');
  };

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
    } else if (!draggedCategoryId && categoryId !== activeCategoryId && categoryId !== 'deadline' && categoryId !== 'linkbook') {
      setDragOverCategoryId(categoryId); 
    }
  };

  const handleCategoryDrop = async (e, targetCategoryId) => {
    e.preventDefault(); 
    const indicator = categoryDragOverIndicator;
    setDragOverCategoryId(null);
    setCategoryDragOverIndicator(null);
    
    if (targetCategoryId === 'deadline' || targetCategoryId === 'linkbook') return;

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
      for (const c of updatedCategories) await setDoc(getCategoryDoc(c.id), { order: c.order }, { merge: true });
      return;
    }

    if (!sourceNoteId || targetCategoryId === activeCategoryId || !user) return;
    setNotes(notes.map(n => n.id === sourceNoteId ? { ...n, categoryId: targetCategoryId, order: Date.now() } : n));
    await setDoc(getNoteDoc(sourceNoteId), { categoryId: targetCategoryId, order: Date.now() }, { merge: true });
  };

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
    if (draggedNoteId === id || activeCategoryId === 'deadline') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
    setDragOverIndicator({ id, position });
  };
  const handleDropOnNote = async (e, targetId) => {
    e.preventDefault();
    const indicator = dragOverIndicator;
    setDragOverIndicator(null);
    if (activeCategoryId === 'deadline') return;
    
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
    
    const updatedNotes = newCategoryNotes.map((note, index) => ({ ...note, order: (index + 1) * 1000 }));
    setNotes(prev => [...prev.filter(n => n.categoryId !== activeCategoryId), ...updatedNotes]);
    for (const note of updatedNotes) await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true });
  };

  const handleLinkDragStart = (e, id) => { e.dataTransfer.setData('linkId', id); setDraggedLinkId(id); };
  const handleLinkDragEnd = () => { setDraggedLinkId(null); setLinkDragOverIndicator(null); };
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

    const currentLinks = linkFilter === 'すべて' ? links : links.filter(l => (l.groupName || '一般') === linkFilter);
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

    const updatedLinks = newLinks.map((l, i) => ({ ...l, order: (i + 1) * 1000 }));
    setLinks(prev => [...prev.filter(l => !updatedLinks.find(ul => ul.id === l.id)), ...updatedLinks]);
    for (const l of updatedLinks) await setDoc(getLinkDoc(l.id), { order: l.order }, { merge: true });
  };

  const openAddModal = () => {
    setEditingNote(null);
    setFormData({ title: '', categoryId: activeCategoryId === 'freenote' || activeCategoryId === 'deadline' || activeCategoryId === 'linkbook' ? categories[0]?.id : activeCategoryId, blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '', x: 40, y: 40 });
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

  const openLinkModal = (link = null) => {
    if (link) setLinkFormData(link);
    else setLinkFormData({ id: '', word: '', url: '', groupName: linkFilter !== 'すべて' ? linkFilter : '一般' });
    setIsLinkModalOpen(true);
  };

  const saveLink = async () => {
    if (!user || !linkFormData.word.trim() || !linkFormData.url.trim()) return;
    const id = linkFormData.id || generateId();
    const data = { ...linkFormData, id, order: linkFormData.order || Date.now() };
    await setDoc(getLinkDoc(id), data, { merge: true });
    setIsLinkModalOpen(false);
  };

  const deleteLink = async (id) => {
    if (!user) return;
    await deleteDoc(getLinkDoc(id));
    setIsLinkModalOpen(false);
  };

  const linkGroups = ['すべて', ...Array.from(new Set(links.map(l => l.groupName || '一般')))];
  const filteredLinks = linkFilter === 'すべて' ? links : links.filter(l => (l.groupName || '一般') === linkFilter);

  const handleFreenotePointerDown = (e, note) => {
    if (e.target.closest('.no-drag') || e.button !== 0) return;
    setCanvasDragState({ id: note.id, startX: e.clientX, startY: e.clientY, initialX: note.x || 40, initialY: note.y || 40 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleFreenotePointerMove = (e) => {
    if (!canvasDragState) return;
    const dx = (e.clientX - canvasDragState.startX) / (zoom / 100);
    const dy = (e.clientY - canvasDragState.startY) / (zoom / 100);
    setNotes(prev => prev.map(n => n.id === canvasDragState.id ? { ...n, x: canvasDragState.initialX + dx, y: canvasDragState.initialY + dy } : n));
  };
  const handleFreenotePointerUp = async (e) => {
    if (!canvasDragState) return;
    const targetNote = notes.find(n => n.id === canvasDragState.id);
    setCanvasDragState(null);
    if (targetNote && user) await setDoc(getNoteDoc(targetNote.id), { x: targetNote.x, y: targetNote.y }, { merge: true });
  };
  const handleFreenoteDoubleClick = (e) => {
    if (!e.target.classList.contains('canvas-bg')) return;
    const rect = freenoteRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) + freenoteRef.current.scrollLeft) / (zoom / 100);
    const y = ((e.clientY - rect.top) + freenoteRef.current.scrollTop) / (zoom / 100);
    
    setEditingNote(null);
    setFormData({ title: '', categoryId: 'freenote', blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '', x, y });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
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

  // ★ 修正2: Excel等からの複雑な画像ペーストに対応
  const handlePaste = async (e) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // パターンA: ファイルとして画像がクリップボードにある場合 (標準のスクショ等)
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

    // パターンB: アイテムとして画像がある場合
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

    // パターンC: HTMLとしてペーストされた場合 (Excelからのコピー等)
    const html = clipboardData.getData('text/html');
    if (html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Excelが画像をBase64形式でHTML内に埋め込んで送ってきた場合を検知
      const imgs = doc.querySelectorAll('img');
      if (imgs.length > 0) {
        const src = imgs[0].src;
        // Base64形式の画像データであれば抽出して挿入
        if (src.startsWith('data:image/')) {
          e.preventDefault();
          insertContentIntoText(src, 'image');
          return;
        }
      }

      // 既存の機能: HTML内のリンク(aタグ)をMarkdownに変換する処理
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

  // ノート抽出ロジック
  let activeNotes = [];
  if (activeCategoryId === 'deadline') {
    activeNotes = notes.filter(n => n.dueDate && (showCompleted ? true : !n.isCompleted)).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
  } else if (activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook') {
    activeNotes = notes.filter(n => n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted));
  }

  // 15分刻みカレンダー用変数
  const dueDateObj = formData.dueDate ? new Date(formData.dueDate) : null;
  const dateStr = dueDateObj ? `${dueDateObj.getFullYear()}-${String(dueDateObj.getMonth() + 1).padStart(2, '0')}-${String(dueDateObj.getDate()).padStart(2, '0')}` : '';
  const hourStr = dueDateObj ? dueDateObj.getHours() : 0;
  const minuteStr = dueDateObj ? dueDateObj.getMinutes() : 0;

  return (
    <div className="h-screen bg-[#F7F9F8] text-[#333333] flex flex-col font-sans overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700&family=Roboto:wght@500;700&display=swap');
        body { font-family: 'Roboto', 'Noto Sans JP', sans-serif; font-weight: 500; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #D7DCD9; border-radius: 20px; }
        .canvas-bg { background-image: radial-gradient(#D7DCD9 2px, transparent 2px); background-size: 30px 30px; }
      `}} />

      <header className="bg-[#FFFFFF] border-b border-[#D7DCD9] shadow-sm h-14 shrink-0 flex items-center justify-between px-4 z-20 relative">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-[#666666] hover:bg-[#F7F9F8] rounded-lg transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          {!isSidebarOpen && <h1 className="text-[18px] sm:text-[20px] font-bold text-[#333333] hidden sm:block">Kanban Notes</h1>}
        </div>
        
        <div className="flex items-center gap-[12px] sm:gap-[16px]">
          {activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook' && (
            <div className="flex items-center gap-[4px] mr-2">
              <label className="flex items-center gap-[4px] cursor-pointer text-[12px] sm:text-[14px] text-[#666666] hover:text-[#333333] transition-colors select-none">
                <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="w-4 h-4 rounded text-[#00CC5B] focus:ring-[#00CC5B]" />
                <span className="font-medium">完了を表示</span>
              </label>
            </div>
          )}
          <div className="hidden sm:flex items-center gap-[8px] text-[14px] text-[#666666] font-medium">
            {user?.photoURL && <img src={user.photoURL} alt="User" className="w-7 h-7 rounded-full border border-[#D7DCD9]" />}
          </div>
          <button onClick={handleLogout} className="p-2 text-[#666666] hover:text-[#333333] hover:bg-[#F7F9F8] rounded-lg transition-colors"><LogOut className="w-5 h-5" /></button>
          {activeCategoryId !== 'linkbook' && (
            <button onClick={() => openAddModal()} className="flex items-center justify-center bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] w-9 h-9 rounded-lg transition-colors shadow-sm ml-2" title="新規メモ">
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* サイドバー */}
        <div className={`transition-all duration-300 ease-in-out shrink-0 z-30 ${isSidebarOpen ? 'w-64' : 'w-0'}`}>
          <aside className={`absolute inset-y-0 left-0 w-64 bg-[#FFFFFF] border-r border-[#D7DCD9] flex flex-col transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex-1 overflow-y-auto custom-scrollbar py-4 px-3 flex flex-col gap-1">
              
              <div onClick={() => handleTabClick('freenote')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'freenote' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
                <PenTool className="w-5 h-5 shrink-0" />
                <span className="font-bold text-[14px]">フリーノート</span>
              </div>
              
              <div onClick={() => handleTabClick('deadline')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'deadline' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
                <Calendar className="w-5 h-5 shrink-0" />
                <span className="font-bold text-[14px]">期限付き</span>
              </div>

              <div onClick={() => handleTabClick('linkbook')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'linkbook' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
                <BookOpen className="w-5 h-5 shrink-0" />
                <span className="font-bold text-[14px]">リンク集</span>
              </div>

              <div className="w-full h-px bg-[#D7DCD9] my-2"></div>

              <div className="px-3 flex items-center justify-between mb-1 group">
                <span className="text-[12px] font-bold text-[#C4C4C4]">ボード</span>
                <button onClick={handleAddCategory} className="text-[#C4C4C4] hover:text-[#00CC5B] opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4"/></button>
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
                      <div className="flex-1 font-bold text-[14px] truncate">{category.name}</div>
                      {activeCategoryId === category.id && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="p-1 text-[#C4C4C4] hover:text-[#00CC5B] rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                          {categories.length > 1 && <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }} className="p-1 text-[#C4C4C4] hover:text-[#ED1C24] rounded"><X className="w-3.5 h-3.5" /></button>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* メインコンテンツ */}
        <main className="flex-1 overflow-hidden relative">
          
          {/* フリーノート */}
          {activeCategoryId === 'freenote' && (
            <div className="w-full h-full relative">
              <div className="w-full h-full overflow-auto custom-scrollbar" ref={freenoteRef} onDoubleClick={handleFreenoteDoubleClick}>
                <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: '0 0', width: 5000, height: 5000 }} className="relative canvas-bg pointer-events-auto">
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
                          <h3 className="font-bold text-[#333333] text-[16px] truncate pr-2 leading-[1.6]">{note.title || '無題'}</h3>
                          <button onClick={(e) => { e.stopPropagation(); openEditModal(note); }} className="no-drag p-1 text-[#666666] hover:text-[#00CC5B] bg-[#F7F9F8] rounded-md shrink-0"><Edit2 className="w-4 h-4"/></button>
                        </div>
                        <div className="max-h-32 overflow-hidden relative no-drag text-[14px]">
                          {note.blocks?.slice(0, 3).map(block => (
                            <div key={block.id} className="py-0.5">
                              {block.type === 'text' && <div className="text-[#666666] line-clamp-2 leading-[1.6]">{block.content}</div>}
                              {block.type === 'list' && <div className="text-[#666666] flex gap-1 leading-[1.6]"><span className="text-[#666666] font-bold">•</span><span className="line-clamp-1">{block.content}</span></div>}
                              {block.type === 'image' && <div className="text-[#666666] flex items-center gap-1 leading-[1.6]"><ImageIcon className="w-3 h-3"/>画像</div>}
                            </div>
                          ))}
                          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#FFFFFF] to-transparent pointer-events-none"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* ズームコントロール */}
              <div className="absolute bottom-6 right-6 bg-[#FFFFFF] rounded-xl shadow-lg border border-[#D7DCD9] flex items-center p-1 z-20">
                <button onClick={() => setZoom(Math.max(10, zoom - 10))} className="p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors"><ZoomOut className="w-5 h-5"/></button>
                <select value={zoom} onChange={e => setZoom(Number(e.target.value))} className="bg-transparent text-[14px] font-bold text-[#333333] outline-none px-2 cursor-pointer appearance-none text-center hover:bg-[#F7F9F8] rounded mx-1">
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200].map(z => <option key={z} value={z}>{z}%</option>)}
                </select>
                <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors"><ZoomIn className="w-5 h-5"/></button>
              </div>
            </div>
          )}

          {/* リンク集 */}
          {activeCategoryId === 'linkbook' && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-8 custom-scrollbar">
              <div className="max-w-3xl mx-auto bg-[#FFFFFF] rounded-2xl shadow-sm border border-[#D7DCD9] min-h-[80vh]">
                <div className="p-6 border-b border-[#D7DCD9] flex items-center justify-between">
                  <h2 className="text-[20px] font-bold flex items-center gap-2"><Link className="w-6 h-6 text-[#00CC5B]"/> リンク集</h2>
                  <button onClick={() => openLinkModal()} className="px-4 py-2 bg-[#00CC5B] text-[#FFFFFF] rounded-lg font-bold hover:bg-[#00AC4C] flex items-center gap-2 text-[14px] transition-colors"><Plus className="w-4 h-4"/> リンクを追加</button>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
                    {linkGroups.map(grp => (
                      <button key={grp} onClick={() => setLinkFilter(grp)} className={`px-4 py-1.5 rounded-full text-[14px] font-bold whitespace-nowrap transition-colors border ${linkFilter === grp ? 'bg-[#00CC5B] text-[#FFFFFF] border-[#00CC5B]' : 'bg-[#FFFFFF] text-[#666666] border-[#D7DCD9] hover:border-[#00CC5B] hover:text-[#00CC5B]'}`}>
                        {grp}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1">
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
                          <div className="font-bold text-[14px] truncate min-w-[100px]">{link.word}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={link.url} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:border-[#00CC5B] hover:text-[#00CC5B] px-3 py-1.5 rounded-md transition-colors">開く</a>
                          <button onClick={() => openLinkModal(link)} className="p-1.5 text-[#C4C4C4] hover:text-[#00CC5B] transition-colors rounded"><Edit2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 通常ボード & 期限タブ */}
          {activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook' && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              <div className="max-w-7xl mx-auto">
                {activeNotes.length === 0 ? (
                  <div onClick={() => openAddModal()} className="text-center py-16 border-2 border-dashed border-[#D7DCD9] rounded-2xl text-[#666666] hover:border-[#00CC5B] hover:text-[#00AC4C] transition-colors cursor-pointer max-w-lg mx-auto mt-10">
                    <div className="text-[18px] font-bold mb-2">メモがありません</div>
                    <div className="text-[14px] font-medium">＋ ここをクリックして新しいメモを追加</div>
                  </div>
                ) : (
                  <div className="columns-2 lg:columns-3 xl:columns-4 gap-3 sm:gap-6 pb-10">
                    {activeNotes.map((note) => {
                      const firstImageBlock = note.blocks?.find(b => b.type === 'image');
                      const dueDateInfo = formatDueDate(note.dueDate);
                      return (
                        <div
                          id={`note-${note.id}`}
                          key={note.id}
                          draggable={activeCategoryId !== 'deadline'}
                          onDragStart={(e) => handleDragStart(e, note.id)}
                          onDragEnd={(e) => handleDragEnd(e, note.id)}
                          onDragOver={(e) => handleDragOverNote(e, note.id)}
                          onDragLeave={() => setDragOverIndicator(null)}
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
                            <div className="mb-2 sm:mb-3 rounded-lg overflow-hidden h-24 sm:h-32 bg-[#F7F9F8] border border-[#D7DCD9] flex items-center justify-center opacity-90">
                              <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-full object-cover" />
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-1 sm:gap-2 mb-2">
                            <h3 className={`font-bold leading-[1.6] line-clamp-2 pr-5 sm:pr-6 text-[16px] sm:text-[18px] ${note.isCompleted ? 'text-[#666666] line-through' : 'text-[#333333]'}`}>
                              {note.title}
                            </h3>
                            <button onClick={(e) => toggleComplete(e, note.id)} className={`absolute top-2 right-2 sm:top-3 sm:right-3 transition-colors p-0.5 sm:p-1 rounded-full shadow-sm border z-10 ${note.isCompleted ? 'text-[#00CC5B] bg-[#E0FFEE] border-[#00CC5B]' : 'text-[#C4C4C4] bg-[#FFFFFF] border-[#D7DCD9]'}`}>
                              {note.isCompleted ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Circle className="w-4 h-4 sm:w-5 sm:h-5 hover:text-[#00CC5B]" />}
                            </button>
                          </div>
                          <div className="relative overflow-hidden max-h-96 rounded-b-lg">
                            <div className="space-y-0 pb-6">
                              {note.blocks?.map(block => (
                                <div key={block.id} className="py-0">
                                  {block.type === 'text' && <LinkifiedText text={block.content} links={links} className={`whitespace-pre-wrap font-medium leading-[1.6] text-[14px] sm:text-[16px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'}`} />}
                                  {block.type === 'list' && (
                                    <div className={`flex items-start gap-[4px] font-medium leading-[1.6] text-[14px] sm:text-[16px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'}`}>
                                      <span className="text-[#666666] font-bold mt-[2px] shrink-0">•</span><LinkifiedText text={block.content} links={links} />
                                    </div>
                                  )}
                                  {block.type === 'checkbox' && (
                                    <div className="flex items-start gap-[4px] cursor-pointer group/check font-medium leading-[1.6] text-[14px] sm:text-[16px]" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                      {block.checked ? <CheckCircle2 className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#00CC5B] mt-[2px] flex-shrink-0 group-hover/check:opacity-70" /> : <Circle className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#C4C4C4] mt-[2px] flex-shrink-0 group-hover/check:text-[#00CC5B]" />}
                                      <span className={`${block.checked || note.isCompleted ? 'line-through text-[#666666]' : 'text-[#333333]'} leading-[1.6]`}>
                                        <LinkifiedText text={block.content} links={links} />
                                      </span>
                                    </div>
                                  )}
                                  {block.type === 'image' && !firstImageBlock && <div className="text-[10px] sm:text-[12px] text-[#666666] flex items-center gap-[4px] my-1"><ImageIcon className="w-3 h-3"/> 画像</div>}
                                </div>
                              ))}
                            </div>
                            <div className={`absolute bottom-0 left-0 right-0 h-10 sm:h-12 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-[#F7F9F8] to-transparent' : 'bg-gradient-to-t from-[#FFFFFF] to-transparent'}`}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* リンク追加・編集モーダル */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#FFFFFF] rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-[#D7DCD9] flex justify-between items-center bg-[#F7F9F8] rounded-t-2xl">
              <h3 className="font-bold text-[18px] text-[#333333]">リンクの{linkFormData.id ? '編集' : '追加'}</h3>
              <button onClick={() => setIsLinkModalOpen(false)} className="text-[#666666] hover:bg-[#FFFFFF] p-1.5 rounded-lg"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-[#666666] mb-1">対象ワード</label>
                <input type="text" value={linkFormData.word} onChange={e => setLinkFormData({...linkFormData, word: e.target.value})} placeholder="例: デザインガイド" className="w-full border border-[#D7DCD9] rounded-lg px-3 py-2 text-[14px] font-medium outline-none focus:border-[#00CC5B]"/>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-[#666666] mb-1">URL (https://...)</label>
                <input type="url" value={linkFormData.url} onChange={e => setLinkFormData({...linkFormData, url: e.target.value})} placeholder="https://..." className="w-full border border-[#D7DCD9] rounded-lg px-3 py-2 text-[14px] font-medium outline-none focus:border-[#00CC5B]"/>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-[#666666] mb-1">カテゴリー (任意)</label>
                <input type="text" value={linkFormData.groupName} onChange={e => setLinkFormData({...linkFormData, groupName: e.target.value})} placeholder="例: 一般" className="w-full border border-[#D7DCD9] rounded-lg px-3 py-2 text-[14px] font-medium outline-none focus:border-[#00CC5B]"/>
              </div>
            </div>
            <div className="p-5 border-t border-[#D7DCD9] flex justify-between bg-[#F7F9F8] rounded-b-2xl">
              {linkFormData.id ? <button onClick={() => deleteLink(linkFormData.id)} className="text-[#ED1C24] font-bold text-[14px] hover:bg-[#FFFFFF] px-3 py-1.5 rounded-lg">削除</button> : <div></div>}
              <div className="flex gap-2">
                <button onClick={() => setIsLinkModalOpen(false)} className="px-4 py-2 text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:border-[#00CC5B] rounded-lg font-bold text-[14px]">キャンセル</button>
                <button onClick={saveLink} className="px-6 py-2 bg-[#00CC5B] text-[#FFFFFF] rounded-lg font-bold text-[14px] hover:bg-[#00AC4C]">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ノート追加・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#FFFFFF] sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-[95vh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#D7DCD9] bg-[#F7F9F8] sm:rounded-t-2xl shrink-0 flex flex-col gap-3 z-10 relative">
              <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-2 flex-col sm:flex-row">
                {/* ★ 修正：flex-wrap を追加して狭い画面で折り返すようにしました */}
                <div className="flex-1 flex flex-wrap items-center gap-[8px] gap-y-3 w-full">
                  <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="flex-1 px-1 py-1 text-[20px] sm:text-[24px] font-bold text-[#333333] bg-transparent border-b-[2px] border-transparent hover:border-[#D7DCD9] focus:border-[#00CC5B] outline-none transition-colors placeholder:text-[#666666] min-w-[150px]" placeholder="タイトル" />
                  
                  <div className="flex items-center gap-2">
                    {/* ④ カレンダー（日時設定）UI */}
                  <div className="flex sm:hidden items-center gap-1 shrink-0">
                    {editingNote && <button type="button" onClick={() => deleteNote(editingNote.id)} className="text-[#666666] hover:text-[#ED1C24] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>}
                    <button type="button" onClick={() => setIsModalOpen(false)} className="text-[#666666] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                </div>

                {/* 各種設定とPC時のボタン */}
                <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto custom-scrollbar pb-1 sm:pb-0 shrink-0">
                  {/* 15分刻みカレンダー UI */}
                  <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#D7DCD9] rounded-lg px-2 py-1.5 focus-within:border-[#00CC5B] transition-colors shrink-0">
                    <Calendar className="w-4 h-4 text-[#666666] mr-1 hidden sm:block" />
                    <input type="date" value={dateStr} onChange={(e) => {
                        const d = new Date(e.target.value);
                        if (!isNaN(d.getTime())) { d.setHours(hourStr, minuteStr, 0, 0); setFormData({...formData, dueDate: d.toISOString()}); }
                        else { setFormData({...formData, dueDate: ''}); }
                      }} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium cursor-pointer" />
                    <select value={hourStr} onChange={(e) => { if (dueDateObj) { dueDateObj.setHours(parseInt(e.target.value)); setFormData({...formData, dueDate: dueDateObj.toISOString()}); }}} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium cursor-pointer appearance-none text-center">
                      {[...Array(24).keys()].map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}時</option>)}
                    </select>
                    <select value={minuteStr} onChange={(e) => { if (dueDateObj) { dueDateObj.setMinutes(parseInt(e.target.value)); setFormData({...formData, dueDate: dueDateObj.toISOString()}); }}} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium cursor-pointer appearance-none text-center">
                      {[0, 15, 30, 45].map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}分</option>)}
                    </select>
                  </div>

                  {/* カテゴリー移動（フリーノート含む） */}
                    <select disabled={formData.categoryId === 'freenote'} value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-24 sm:w-32 px-2 sm:px-3 py-1.5 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] bg-[#FFFFFF] text-[12px] sm:text-[14px] text-[#333333] shrink-0 font-medium disabled:opacity-50">
                      <option value="freenote" className="hidden">フリーノート</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                {/* ★ 修正：ボタン群を右上に固定するためのレイアウト調整 */}
                <div className="flex items-center gap-1 shrink-0 absolute right-4 top-4 sm:relative sm:right-auto sm:top-auto bg-[#F7F9F8]">
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
                              ${block.type === 'checkbox' && block.checked ? 'text-[#666666] line-through' : 'text-[#333333]'} text-[14px] sm:text-[16px]`}
                            rows={1}
                            placeholder={block.type === 'text' ? (index === 0 ? "ここからメモを入力..." : "") : "項目を入力..."}
                          />
                        )}
                      </div>
                      
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => removeBlock(block.id)} className="absolute right-0 top-1 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-[#C4C4C4] hover:text-[#ED1C24] hover:bg-[#F7F9F8] rounded transition-all" title="この行を削除">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}