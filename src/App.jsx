import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2, AlertCircle, LogOut } from 'lucide-react';

// --- Firebase のインポートと初期化 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ▼▼▼ ここをご自身のFirebase設定に書き換えてください ▼▼▼
let firebaseConfig = {
  apiKey: "AIzaSyCqTZxvNFGf0O4_DDa7JQ45Zd8hxYKqYHY",
  authDomain: "kanban-cloud-app.firebaseapp.com",
  projectId: "kanban-cloud-app",
  storageBucket: "kanban-cloud-app.firebasestorage.app",
  messagingSenderId: "584318556014",
  appId: "1:584318556014:web:426b5fbfb962b730a7137f"
};
// ▲▲▲ ここまで ▲▲▲

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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [notes, setNotes] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [] });
  const fileInputRef = useRef(null);

  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverNoteId, setDragOverNoteId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);

  // カーソル位置を記憶して、テキスト途中に要素を挿入するためのRef
  const [activeBlockId, setActiveBlockId] = useState(null);
  const activeBlockInfoRef = useRef({ id: null, cursorPosition: 0 });

  const saveCursorPosition = (e, blockId) => {
    activeBlockInfoRef.current = {
      id: blockId,
      cursorPosition: e.target.selectionStart || 0
    };
    setActiveBlockId(blockId);
  };

  // ==========================================
  // テキストエリアのリサイズ処理
  // ==========================================
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
  }, [isModalOpen, formData.blocks]);

  const handleTextareaResize = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    // 無理なスクロール補正を廃止し、ブラウザの自然な追従に任せます
  };

  // ==========================================
  // Firebase の初期化とデータ同期
  // ==========================================
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
      console.error("Login error", error);
      if (error.code === 'auth/unauthorized-domain') {
        alert(`【ドメイン未登録エラー】\n\nFirebase Console にて承認済みドメインを追加してください:\n\n${window.location.hostname}`);
      } else {
        alert("ログインに失敗しました。もう一度お試しください。");
      }
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (error) { console.error("Logout error", error); }
  };

  useEffect(() => {
    if (!user || !isConfigValid) {
      setCategories([]); setNotes([]); return;
    }
    const categoriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'categories');
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    let isInitialCategoryLoad = true;

    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const loadedCategories = snapshot.docs.map(d => d.data()).sort((a, b) => a.createdAt - b.createdAt);
      if (loadedCategories.length === 0 && isInitialCategoryLoad) {
        const defaultId = generateId();
        setDoc(doc(categoriesRef, defaultId), { id: defaultId, name: 'メインボード', createdAt: Date.now() });
      } else {
        setCategories(loadedCategories);
        setActiveCategoryId(prev => loadedCategories.find(c => c.id === prev) ? prev : loadedCategories[0]?.id);
      }
      isInitialCategoryLoad = false;
    }, (error) => console.error(error));

    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      const loadedNotes = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setNotes(loadedNotes);
      setLoading(false);
    }, (error) => console.error(error));

    return () => { unsubCategories(); unsubNotes(); };
  }, [user]);

  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);

  // ==========================================
  // 操作アクション
  // ==========================================
  const handleAddCategory = async () => {
    if (!user) return;
    const newId = generateId();
    const newCategory = { id: newId, name: '新しいカテゴリー', createdAt: Date.now() };
    await setDoc(getCategoryDoc(newId), newCategory);
    setActiveCategoryId(newId);
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
  };

  const openAddModal = () => {
    setEditingNote(null);
    setFormData({ title: '', categoryId: activeCategoryId, blocks: [{ id: generateId(), type: 'text', content: '', checked: false }] });
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

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('noteId', id); setDraggedNoteId(id);
    setTimeout(() => { const el = document.getElementById(`note-${id}`); if (el) el.classList.add('opacity-40'); }, 0);
  };
  const handleDragEnd = (e, id) => {
    setDraggedNoteId(null); setDragOverNoteId(null); setDragOverCategoryId(null);
    const el = document.getElementById(`note-${id}`); if (el) el.classList.remove('opacity-40');
  };
  const handleDragOverNote = (e, id) => { e.preventDefault(); if (dragOverNoteId !== id && draggedNoteId !== id) setDragOverNoteId(id); };
  const handleDropOnNote = async (e, targetId) => {
    e.preventDefault(); setDragOverNoteId(null);
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || sourceId === targetId || !user) return;
    const categoryNotes = notes.filter(n => n.categoryId === activeCategoryId).sort((a,b) => a.order - b.order);
    const sourceIndex = categoryNotes.findIndex(n => n.id === sourceId);
    const targetIndex = categoryNotes.findIndex(n => n.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const newCategoryNotes = [...categoryNotes];
    const [removed] = newCategoryNotes.splice(sourceIndex, 1);
    newCategoryNotes.splice(targetIndex, 0, removed);
    const updatedNotes = newCategoryNotes.map((note, index) => ({ ...note, order: index * 1000 }));
    setNotes(prev => {
      const otherNotes = prev.filter(n => n.categoryId !== activeCategoryId);
      return [...otherNotes, ...updatedNotes];
    });
    for (const note of updatedNotes) { await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true }); }
  };
  const handleCategoryDragOver = (e, categoryId) => { e.preventDefault(); if (categoryId !== activeCategoryId) setDragOverCategoryId(categoryId); };
  const handleCategoryDrop = async (e, targetCategoryId) => {
    e.preventDefault(); setDragOverCategoryId(null);
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || targetCategoryId === activeCategoryId || !user) return;
    setNotes(notes.map(n => n.id === sourceId ? { ...n, categoryId: targetCategoryId, order: Date.now() } : n));
    await setDoc(getNoteDoc(sourceId), { categoryId: targetCategoryId, order: Date.now() }, { merge: true });
  };

  // --- ブロックエディタ（文中への分割挿入対応） ---
  const addBlock = (type) => {
    setFormData(prev => {
      const { id: targetId, cursorPosition } = activeBlockInfoRef.current;
      const activeIdx = prev.blocks.findIndex(b => b.id === targetId);

      // テキストブロックの途中に挿入する場合
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

        setTimeout(() => {
          const el = document.getElementById(`block-input-${newBlockId}`);
          if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        }, 50);

        activeBlockInfoRef.current = { id: newBlockId, cursorPosition: 0 };
        setActiveBlockId(newBlockId);

        return { ...prev, blocks: newBlocks };
      } 
      // それ以外（テキスト以外を選択中、または未選択）の場合
      else {
        const newId = generateId();
        const insertIdx = activeIdx !== -1 ? activeIdx + 1 : prev.blocks.length;
        const newBlocks = [...prev.blocks];
        newBlocks.splice(insertIdx, 0, { id: newId, type, content: '', checked: false });
        
        setTimeout(() => {
          const el = document.getElementById(`block-input-${newId}`);
          if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        }, 50);

        activeBlockInfoRef.current = { id: newId, cursorPosition: 0 };
        setActiveBlockId(newId);

        return { ...prev, blocks: newBlocks };
      }
    });
  };

  const updateBlock = (blockId, updates) => {
    setFormData(prev => ({ ...prev, blocks: prev.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }));
  };
  const removeBlock = (blockId) => {
    setFormData(prev => ({ ...prev, blocks: prev.blocks.filter(b => b.id !== blockId) }));
  };

  const handleKeyDown = (e, index, blockType) => {
    if (e.nativeEvent.isComposing) return;
    
    // Backspaceで空の行を削除して前の行に戻る
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
              prevInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        
        setTimeout(() => {
          const el = document.getElementById(`block-input-${newId}`);
          if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        }, 10);
        
        activeBlockInfoRef.current = { id: newId, cursorPosition: 0 };
        setActiveBlockId(newId);
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
        const { id: targetId, cursorPosition } = activeBlockInfoRef.current;
        const activeIdx = prev.blocks.findIndex(b => b.id === targetId);

        // テキストの途中に挿入する場合
        if (activeIdx !== -1 && prev.blocks[activeIdx].type === 'text') {
          const targetBlock = prev.blocks[activeIdx];
          const textBefore = targetBlock.content.substring(0, cursorPosition);
          const textAfter = targetBlock.content.substring(cursorPosition);

          const newImageId = generateId();
          const newTextId = generateId();
          const newBlocks = [...prev.blocks];

          newBlocks[activeIdx] = { ...targetBlock, content: textBefore };
          newBlocks.splice(activeIdx + 1, 0, 
            { id: newImageId, type: 'image', content: compressedUrl },
            { id: newTextId, type: 'text', content: textAfter, checked: false }
          );

          // 画像の後のテキストエリアにフォーカス
          setTimeout(() => {
            const el = document.getElementById(`block-input-${newTextId}`);
            if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
          }, 50);

          activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
          setActiveBlockId(newTextId);

          return { ...prev, blocks: newBlocks };
        } 
        // それ以外の場合
        else {
          const newImageId = generateId();
          const newTextId = generateId();
          const insertIdx = activeIdx !== -1 ? activeIdx + 1 : prev.blocks.length;
          const newBlocks = [...prev.blocks];
          
          newBlocks.splice(insertIdx, 0, 
            { id: newImageId, type: 'image', content: compressedUrl },
            { id: newTextId, type: 'text', content: '', checked: false }
          );
          
          setTimeout(() => {
            const el = document.getElementById(`block-input-${newTextId}`);
            if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
          }, 50);

          activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
          setActiveBlockId(newTextId);

          return { ...prev, blocks: newBlocks };
        }
      });
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handlePaste = async (e, index) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressedUrl = await compressImage(reader.result);
          
          setFormData(prev => {
            const cursorPosition = e.target.selectionStart || 0;
            const targetBlock = prev.blocks[index];

            if (targetBlock.type === 'text') {
              const textBefore = targetBlock.content.substring(0, cursorPosition);
              const textAfter = targetBlock.content.substring(cursorPosition);

              const newImageId = generateId();
              const newTextId = generateId();
              const newBlocks = [...prev.blocks];

              newBlocks[index] = { ...targetBlock, content: textBefore };
              newBlocks.splice(index + 1, 0, 
                { id: newImageId, type: 'image', content: compressedUrl },
                { id: newTextId, type: 'text', content: textAfter, checked: false }
              );

              setTimeout(() => {
                const el = document.getElementById(`block-input-${newTextId}`);
                if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
              }, 50);

              activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
              setActiveBlockId(newTextId);

              return { ...prev, blocks: newBlocks };
            } else {
               const newImageId = generateId();
               const newTextId = generateId();
               const newBlocks = [...prev.blocks];
               newBlocks.splice(index + 1, 0, 
                 { id: newImageId, type: 'image', content: compressedUrl },
                 { id: newTextId, type: 'text', content: '', checked: false }
               );
               
               setTimeout(() => {
                 const el = document.getElementById(`block-input-${newTextId}`);
                 if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
               }, 50);

               activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
               setActiveBlockId(newTextId);

               return { ...prev, blocks: newBlocks };
            }
          });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  // ==========================================
  // レンダリング
  // ==========================================
  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-800 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full">
          <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8" /></div>
          <h2 className="text-xl font-bold mb-4 text-center">Firebaseの設定が完了していません</h2>
        </div>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-800 p-6">
        <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3"><CheckSquare className="w-10 h-10" /></div>
          <h1 className="text-3xl font-extrabold mb-2 text-slate-800">Kanban Notes</h1>
          <button onClick={handleGoogleLogin} className="mt-8 w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-4 rounded-xl font-bold transition-all shadow-sm">
            Googleでログインして始める
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="font-medium">同期中...</p>
      </div>
    );
  }

  const activeNotes = notes.filter(n => n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}} />

      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Kanban Notes <span className="text-[10px] sm:text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full font-bold ml-1 sm:ml-2">Cloud</span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 font-medium">
              {user?.photoURL && <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-slate-200" />}
              {user?.displayName || 'ユーザー'}
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><LogOut className="w-5 h-5" /></button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={() => openAddModal()} className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white w-10 h-10 rounded-lg transition-colors shadow-sm" title="新規メモ">
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* カテゴリーナビゲーション */}
        <div className="px-4 sm:px-6 flex items-end gap-2 overflow-x-auto custom-scrollbar pb-0">
          {categories.map(category => (
            <div
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              onDragOver={(e) => handleCategoryDragOver(e, category.id)}
              onDragLeave={() => setDragOverCategoryId(null)}
              onDrop={(e) => handleCategoryDrop(e, category.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-3 border-b-2 transition-all cursor-pointer whitespace-nowrap
                ${activeCategoryId === category.id ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : dragOverCategoryId === category.id ? 'border-indigo-400 text-indigo-600 bg-indigo-50 scale-105' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
              `}
            >
              {editingCategoryId === category.id ? (
                <input type="text" value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onBlur={() => saveCategoryName(category.id)} onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)} autoFocus className="border border-indigo-300 rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white w-24 sm:w-32" />
              ) : (
                <>
                  <span className="font-semibold text-sm select-none">{category.name}</span>
                  {activeCategoryId === category.id && (
                    <div className="flex items-center ml-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                      {categories.length > 1 && <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }} className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <button onClick={handleAddCategory} className="flex items-center gap-1 px-3 sm:px-4 py-3 text-slate-500 hover:text-indigo-600 border-b-2 border-transparent transition-colors font-medium text-sm whitespace-nowrap">
            <FolderPlus className="w-4 h-4" /> 追加
          </button>
          <div className="ml-auto flex items-center mb-3 pr-2 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm text-slate-500 hover:text-slate-700 transition-colors select-none">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-indigo-600 focus:ring-indigo-500" />
              <span className="font-medium">完了を表示</span>
            </label>
          </div>
        </div>
      </header>

      {/* メインボード */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-7xl mx-auto h-full">
          {activeNotes.length === 0 ? (
            <div onClick={() => openAddModal()} className="text-center py-16 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer max-w-lg mx-auto mt-10">
              <div className="text-lg font-medium mb-2">メモがありません</div>
              <div className="text-sm">＋ ここをクリックして新しいメモを追加</div>
            </div>
          ) : (
            <div className="columns-2 lg:columns-3 xl:columns-4 gap-3 sm:gap-6 pb-10">
              {activeNotes.map((note) => {
                const firstImageBlock = note.blocks?.find(b => b.type === 'image');
                return (
                  <div
                    id={`note-${note.id}`}
                    key={note.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, note.id)}
                    onDragEnd={(e) => handleDragEnd(e, note.id)}
                    onDragOver={(e) => handleDragOverNote(e, note.id)}
                    onDragLeave={() => setDragOverNoteId(null)}
                    onDrop={(e) => handleDropOnNote(e, note.id)}
                    onClick={() => openEditModal(note)}
                    className={`break-inside-avoid mb-3 sm:mb-6 group rounded-xl p-3 sm:p-4 border shadow-sm transition-all cursor-pointer relative
                      ${dragOverNoteId === note.id ? 'border-indigo-500 ring-2 ring-indigo-200 scale-[1.02] z-10' : 'hover:shadow-md hover:border-indigo-400'}
                      ${note.isCompleted ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100' : 'bg-white border-slate-200'}
                    `}
                  >
                    {firstImageBlock && (
                      <div className="mb-2 sm:mb-3 rounded-lg overflow-hidden h-24 sm:h-32 bg-slate-100 border border-slate-200 flex items-center justify-center opacity-90">
                        <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-full object-cover" />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-1 sm:gap-2 mb-2">
                      <h3 className={`font-semibold leading-snug line-clamp-2 pr-5 sm:pr-6 text-sm sm:text-base ${note.isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                        {note.title}
                      </h3>
                      <button onClick={(e) => toggleComplete(e, note.id)} className={`absolute top-2 right-2 sm:top-3 sm:right-3 transition-colors p-0.5 sm:p-1 rounded-full shadow-sm border z-10 ${note.isCompleted ? 'text-green-500 bg-green-50 border-green-200' : 'text-slate-300 bg-white border-slate-100'}`}>
                        {note.isCompleted ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Circle className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>
                    </div>
                    <div className="relative overflow-hidden max-h-96 rounded-b-lg">
                      <div className="space-y-0 text-xs sm:text-[15px] pb-6">
                        {note.blocks?.map(block => (
                          <div key={block.id} className="py-0">
                            {block.type === 'text' && <div className={`whitespace-pre-wrap leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>{block.content}</div>}
                            {block.type === 'list' && (
                              <div className={`flex items-start gap-1 sm:gap-1.5 leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-700'}`}>
                                <span className="text-slate-400 font-bold mt-0.5 shrink-0">•</span><span>{block.content}</span>
                              </div>
                            )}
                            {block.type === 'checkbox' && (
                              <div className="flex items-start gap-1.5 sm:gap-2 cursor-pointer group/check leading-relaxed" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                {block.checked ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 mt-0.5 flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 mt-0.5 flex-shrink-0" />}
                                <span className={`${block.checked || note.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'} leading-snug`}>{block.content}</span>
                              </div>
                            )}
                            {block.type === 'image' && !firstImageBlock && <div className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1 my-1"><ImageIcon className="w-3 h-3"/> 画像</div>}
                          </div>
                        ))}
                      </div>
                      <div className={`absolute bottom-0 left-0 right-0 h-10 sm:h-12 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-slate-50 to-transparent' : 'bg-gradient-to-t from-white to-transparent'}`}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ノート追加・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-[95vh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            {/* ヘッダー＆ツールバー */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50 sm:rounded-t-2xl shrink-0 flex flex-col gap-3 shadow-sm z-10 relative">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 flex items-center gap-2">
                  <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="flex-1 px-1 py-1 text-lg sm:text-xl font-bold text-slate-800 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none transition-colors placeholder:text-slate-400" placeholder="タイトル" />
                  <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-28 sm:w-40 px-2 sm:px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-xs sm:text-sm text-slate-600 shrink-0">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editingNote && <button type="button" onClick={() => deleteNote(editingNote.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>}
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1 sm:gap-2">
                  <button type="button" onClick={() => addBlock('text')} title="テキストを追加" className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"><AlignLeft className="w-5 h-5" /></button>
                  <button type="button" onClick={() => addBlock('list')} title="リストを追加" className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"><List className="w-5 h-5" /></button>
                  <button type="button" onClick={() => addBlock('checkbox')} title="チェックボックスを追加" className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"><CheckSquare className="w-5 h-5" /></button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} title="画像を追加" className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"><ImageIcon className="w-5 h-5" /></button>
                  <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 sm:px-4 sm:py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors text-xs sm:text-sm">キャンセル</button>
                  <button type="button" onClick={saveNote} className="px-3 py-1.5 sm:px-5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors shadow-sm flex items-center gap-1.5 text-xs sm:text-sm"><Check className="w-4 h-4" /> 保存</button>
                </div>
              </div>
            </div>

            {/* エディタ部分 */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[50vh] custom-scrollbar flex flex-col relative bg-white sm:rounded-b-2xl">
              <div className="flex-1 relative">
                <div className="space-y-0">
                  {formData.blocks?.map((block, index) => (
                    <div key={block.id} className="flex items-start group relative">
                      <div className={`flex justify-center shrink-0 ${block.type === 'text' ? 'w-1 sm:w-0' : 'w-6 sm:w-7 pt-[6px]'}`}> 
                        {block.type === 'list' && <div className="text-slate-400 font-bold text-lg">•</div>}
                        {block.type === 'checkbox' && (
                          <div className="cursor-pointer" onClick={() => updateBlock(block.id, { checked: !block.checked })}>
                            {block.checked ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5 text-slate-300 hover:text-indigo-300" />}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 pl-1 pr-6 sm:pr-8">
                        {block.type === 'image' ? (
                          <div className="relative inline-block my-2 w-full">
                            <img src={block.content} alt="添付画像" className="max-w-full max-h-[400px] object-contain rounded-lg border border-slate-200" />
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
                            className={`w-full bg-transparent resize-none outline-none py-0.5 m-0 leading-relaxed overflow-hidden min-h-[28px]
                              ${block.type === 'checkbox' && block.checked ? 'text-slate-400 line-through' : 'text-slate-800'} text-sm sm:text-[15px]`}
                            rows={1}
                            placeholder={block.type === 'text' ? (index === 0 ? "ここからメモを入力..." : "") : "項目を入力..."}
                          />
                        )}
                      </div>
                      
                      <button type="button" onClick={() => removeBlock(block.id)} className="absolute right-0 top-1 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-opacity" title="この行を削除">
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