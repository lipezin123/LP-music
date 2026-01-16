// Estado da aplicação
let currentVideoId = null;
let selectedType = null;
let favorites = JSON.parse(localStorage.getItem('lpMusicFavorites')) || [];
let showingFavorites = false;
let currentPage = 1;
let totalPages = 1;
let allVideos = [];
const VIDEOS_PER_PAGE = 12;

// Elementos DOM
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const videosGrid = document.getElementById('videosGrid');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const sectionTitle = document.getElementById('sectionTitle');
const downloadModal = document.getElementById('downloadModal');
const progressModal = document.getElementById('progressModal');
const floatingPlayer = document.getElementById('floatingPlayer');
const closeBtn = document.querySelector('.close-btn');
const closePlayerBtn = document.getElementById('closePlayer');
const minimizePlayerBtn = document.getElementById('minimizePlayer');
const confirmDownloadBtn = document.getElementById('confirmDownloadBtn');
const modalVideoTitle = document.getElementById('modalVideoTitle');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const progressStatus = document.getElementById('progressStatus');
const favoritesBtn = document.getElementById('favoritesBtn');
const favoritesCount = document.getElementById('favoritesCount');
const floatingPlayerContainer = document.getElementById('floatingPlayerContainer');
const floatingPlayerTitle = document.getElementById('floatingPlayerTitle');
const paginationContainer = document.getElementById('paginationContainer');
const paginationNumbers = document.getElementById('paginationNumbers');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');

// Event Listeners
searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSearch();
});

closeBtn.addEventListener('click', () => {
  downloadModal.style.display = 'none';
});

closePlayerBtn.addEventListener('click', closePlayer);
minimizePlayerBtn.addEventListener('click', toggleMinimizePlayer);

confirmDownloadBtn.addEventListener('click', startDownload);
favoritesBtn.addEventListener('click', toggleFavoritesView);

prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));

// Navegação por teclado (setas esquerda/direita)
document.addEventListener('keydown', (e) => {
  // Ignorar se estiver digitando em um input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  // Ignorar se modal estiver aberto
  if (downloadModal.style.display === 'block' || progressModal.style.display === 'block') return;
  
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (currentPage > 1) goToPage(currentPage - 1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (currentPage < totalPages) goToPage(currentPage + 1);
  }
});

// Fechar modal ao clicar fora
window.addEventListener('click', (e) => {
  if (e.target === downloadModal) {
    downloadModal.style.display = 'none';
  }
  if (e.target === progressModal) {
    // Não permitir fechar durante download
  }
});

// Selecionar tipo de download
document.querySelectorAll('.download-option-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.download-option-btn').forEach(b => b.classList.remove('selected'));
    this.classList.add('selected');
    selectedType = this.dataset.type;
    confirmDownloadBtn.style.display = 'flex';
  });
});

// Draggable floating player
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;

floatingPlayer.querySelector('.floating-player-header').addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', dragEnd);

function dragStart(e) {
  if (e.target.closest('.player-control-btn')) return;
  
  initialX = e.clientX - floatingPlayer.offsetLeft;
  initialY = e.clientY - floatingPlayer.offsetTop;
  isDragging = true;
  floatingPlayer.classList.add('dragging');
}

function drag(e) {
  if (!isDragging) return;
  
  e.preventDefault();
  currentX = e.clientX - initialX;
  currentY = e.clientY - initialY;
  
  floatingPlayer.style.left = currentX + 'px';
  floatingPlayer.style.top = currentY + 'px';
  floatingPlayer.style.right = 'auto';
  floatingPlayer.style.bottom = 'auto';
}

function dragEnd() {
  isDragging = false;
  floatingPlayer.classList.remove('dragging');
}

// Atualizar contador de favoritas
updateFavoritesCount();

// Verificar status do servidor ao iniciar
checkServerStatus();

// Carregar vídeos em alta ao iniciar
loadVideos();

// Verificar status do servidor
async function checkServerStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Servidor online');
      console.log('yt-dlp disponível:', data.ytDlpAvailable);
      
      if (!data.ytDlpAvailable) {
        console.warn('⚠️ yt-dlp não está instalado - downloads não funcionarão');
      }
    }
  } catch (error) {
    console.error('❌ Erro ao verificar status do servidor:', error);
  }
}

// Funções
async function loadVideos(query = '') {
  showLoading();
  hideError();
  showingFavorites = false;
  currentPage = 1;
  
  try {
    const url = query 
      ? `/api/videos?q=${encodeURIComponent(query)}`
      : '/api/videos';
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success && data.videos) {
      allVideos = data.videos;
      totalPages = Math.ceil(allVideos.length / VIDEOS_PER_PAGE);
      displayCurrentPage();
      updatePagination();
      sectionTitle.textContent = query 
        ? `🔍 Resultados para "${query}"`
        : '🔥 Músicas em Alta no Brasil';
    } else {
      showError('Erro ao carregar vídeos');
    }
  } catch (error) {
    console.error('Erro:', error);
    showError('Erro ao conectar com o servidor. Verifique se o servidor está rodando.');
  } finally {
    hideLoading();
  }
}

function handleSearch() {
  const query = searchInput.value.trim();
  loadVideos(query);
}

async function toggleFavoritesView() {
  if (showingFavorites) {
    searchInput.value = '';
    loadVideos();
  } else {
    showFavorites();
  }
}

async function showFavorites() {
  if (favorites.length === 0) {
    showEmptyFavorites();
    return;
  }

  showLoading();
  hideError();
  showingFavorites = true;
  currentPage = 1;
  sectionTitle.textContent = '';
  
  try {
    const favoriteVideos = [];
    
    for (const videoId of favorites) {
      try {
        const response = await fetch(`/api/videos?q=${videoId}`);
        const data = await response.json();
        
        if (data.success && data.videos && data.videos.length > 0) {
          const video = data.videos.find(v => v.id === videoId);
          if (video) {
            favoriteVideos.push(video);
          }
        }
      } catch (error) {
        console.error(`Erro ao buscar vídeo ${videoId}:`, error);
      }
    }
    
    if (favoriteVideos.length === 0) {
      showEmptyFavorites();
    } else {
      allVideos = favoriteVideos;
      totalPages = Math.ceil(allVideos.length / VIDEOS_PER_PAGE);
      displayCurrentPage();
      updatePagination();
    }
    
  } catch (error) {
    console.error('Erro ao carregar favoritas:', error);
    showError('Erro ao carregar músicas favoritas');
  } finally {
    hideLoading();
  }
}

function showEmptyFavorites() {
  hideLoading();
  showingFavorites = true;
  sectionTitle.textContent = '';
  videosGrid.innerHTML = `
    <div class="empty-favorites" style="grid-column: 1/-1;">
      <i class="fas fa-heart-broken"></i>
      <h3>Nenhuma música favoritada ainda</h3>
      <p>Comece a favoritar suas músicas preferidas!</p>
    </div>
  `;
  videosGrid.style.display = 'grid';
  paginationContainer.style.display = 'none';
}

function displayCurrentPage() {
  const start = (currentPage - 1) * VIDEOS_PER_PAGE;
  const end = start + VIDEOS_PER_PAGE;
  const videosToShow = allVideos.slice(start, end);
  
  displayVideos(videosToShow);
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function displayVideos(videos) {
  videosGrid.innerHTML = '';
  
  if (videos.length === 0) {
    videosGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: var(--text-secondary);">Nenhum vídeo encontrado</p>';
    paginationContainer.style.display = 'none';
    return;
  }
  
  videos.forEach(video => {
    const isFavorited = favorites.includes(video.id);
    const card = createVideoCard(video, isFavorited);
    videosGrid.appendChild(card);
  });
}

function createVideoCard(video, isFavorited) {
  const card = document.createElement('div');
  card.className = 'video-card';
  
  card.innerHTML = `
    <div class="video-thumbnail" data-id="${video.id}" data-title="${video.title}">
      <img src="${video.thumbnail}" alt="${video.title}">
      <div class="play-overlay">
        <div class="play-btn-overlay">
          <i class="fas fa-play"></i>
        </div>
      </div>
    </div>
    <div class="video-info">
      <h3 class="video-title">${video.title}</h3>
      <p class="video-channel">${video.channelTitle}</p>
      <div class="video-actions">
        <button class="action-btn favorite-btn ${isFavorited ? 'favorited' : ''}" data-id="${video.id}">
          <i class="fas fa-heart"></i>
        </button>
        <button class="action-btn download-btn" data-id="${video.id}" data-title="${video.title}">
          <i class="fas fa-download"></i> Download
        </button>
      </div>
    </div>
  `;
  
  const thumbnail = card.querySelector('.video-thumbnail');
  thumbnail.addEventListener('click', () => {
    openFloatingPlayer(video.id, video.title);
  });
  
  const favoriteBtn = card.querySelector('.favorite-btn');
  favoriteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(video.id, favoriteBtn);
  });
  
  const downloadBtn = card.querySelector('.download-btn');
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDownloadModal(video.id, video.title);
  });
  
  return card;
}

function openFloatingPlayer(videoId, title) {
  floatingPlayerTitle.textContent = title;
  
  floatingPlayerContainer.innerHTML = `
    <iframe 
      src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" 
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
      allowfullscreen>
    </iframe>
  `;
  
  floatingPlayer.style.display = 'block';
  floatingPlayer.classList.remove('minimized');
}

function closePlayer() {
  floatingPlayer.style.display = 'none';
  floatingPlayerContainer.innerHTML = '';
}

function toggleMinimizePlayer() {
  floatingPlayer.classList.toggle('minimized');
}

function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  displayCurrentPage();
  updatePagination();
}

function updatePagination() {
  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    return;
  }
  
  paginationContainer.style.display = 'flex';
  paginationNumbers.innerHTML = '';
  
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
  
  // Criar container scrollável para todas as páginas
  const scrollContainer = document.createElement('div');
  scrollContainer.style.display = 'flex';
  scrollContainer.style.gap = '0.5rem';
  scrollContainer.style.overflowX = 'auto';
  scrollContainer.style.overflowY = 'hidden';
  scrollContainer.style.maxWidth = '100%';
  scrollContainer.style.padding = '0.25rem';
  scrollContainer.style.scrollbarWidth = 'thin';
  scrollContainer.className = 'pagination-scroll';
  
  // Adicionar TODAS as páginas
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = 'pagination-number';
    btn.textContent = i;
    btn.style.setProperty('--index', i - 1);
    
    if (i === currentPage) {
      btn.classList.add('active');
    }
    
    btn.addEventListener('click', () => goToPage(i));
    scrollContainer.appendChild(btn);
  }
  
  // Adicionar info de páginas
  const pageInfo = document.createElement('div');
  pageInfo.className = 'page-info';
  pageInfo.style.cssText = `
    font-size: 0.875rem;
    color: var(--text-secondary);
    white-space: nowrap;
    padding: 0 0.5rem;
  `;
  pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
  
  paginationNumbers.appendChild(pageInfo);
  paginationNumbers.appendChild(scrollContainer);
  
  // Scroll automático para a página atual
  setTimeout(() => {
    const activeBtn = scrollContainer.querySelector('.active');
    if (activeBtn) {
      activeBtn.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest',
        inline: 'center' 
      });
    }
  }, 100);
}

// Funções removidas - não são mais necessárias com scroll infinito

function toggleFavorite(videoId, btn) {
  const index = favorites.indexOf(videoId);
  
  if (index > -1) {
    favorites.splice(index, 1);
    btn.classList.remove('favorited');
    
    if (showingFavorites) {
      showFavorites();
    }
  } else {
    favorites.push(videoId);
    btn.classList.add('favorited');
  }
  
  localStorage.setItem('lpMusicFavorites', JSON.stringify(favorites));
  updateFavoritesCount();
}

function updateFavoritesCount() {
  favoritesCount.textContent = favorites.length;
}

function openDownloadModal(videoId, title) {
  currentVideoId = videoId;
  modalVideoTitle.textContent = title;
  selectedType = null;
  
  document.querySelectorAll('.download-option-btn').forEach(b => b.classList.remove('selected'));
  confirmDownloadBtn.style.display = 'none';
  
  downloadModal.style.display = 'block';
}

async function startDownload() {
  if (!currentVideoId || !selectedType) return;
  
  downloadModal.style.display = 'none';
  progressModal.style.display = 'block';
  
  progressBar.style.width = '0%';
  progressPercent.textContent = '0%';
  progressStatus.textContent = 'Iniciando download...';
  progressStatus.style.color = '';
  
  try {
    const url = `/api/download?videoId=${currentVideoId}&type=${selectedType}`;
    
    console.log('📥 Iniciando download:', url);
    
    const response = await fetch(url);
    
    // Verificar se houve erro
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || 'Erro no download');
    }
    
    const contentLength = response.headers.get('content-length');
    const total = parseInt(contentLength, 10);
    let loaded = 0;
    
    const reader = response.body.getReader();
    const chunks = [];
    
    progressStatus.textContent = 'Baixando arquivo...';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loaded += value.length;
      
      if (total) {
        const progress = Math.min((loaded / total * 100), 99);
        progressBar.style.width = progress + '%';
        progressPercent.textContent = Math.round(progress) + '%';
        progressStatus.textContent = `Baixando... ${formatBytes(loaded)} de ${formatBytes(total)}`;
      } else {
        progressStatus.textContent = `Baixando... ${formatBytes(loaded)}`;
      }
    }
    
    progressStatus.textContent = 'Processando arquivo...';
    
    const blob = new Blob(chunks);
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    
    const contentDisposition = response.headers.get('content-disposition');
    let filename;
    
    if (contentDisposition) {
      const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (matches && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    }
    
    if (!filename) {
      filename = `video_${currentVideoId}.${selectedType === 'audio' ? 'mp3' : 'mp4'}`;
    }
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
    
    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressStatus.textContent = '✅ Download concluído com sucesso!';
    progressStatus.style.color = '#10b981';
    
    setTimeout(() => {
      progressModal.style.display = 'none';
      progressStatus.style.color = '';
    }, 3000);
    
  } catch (error) {
    console.error('❌ Erro no download:', error);
    
    let errorMsg = error.message;
    let suggestion = '';
    
    // Mensagens de erro personalizadas
    if (error.message.includes('yt-dlp não está instalado')) {
      errorMsg = 'yt-dlp não está instalado';
      suggestion = 'Instale o yt-dlp no servidor para fazer downloads';
    } else if (error.message.includes('timeout')) {
      errorMsg = 'Download demorou muito tempo';
      suggestion = 'Tente novamente ou escolha um vídeo menor';
    } else if (error.message.includes('não encontrado') || error.message.includes('not found')) {
      errorMsg = 'Vídeo não encontrado';
      suggestion = 'O vídeo pode ter sido removido do YouTube';
    } else if (error.message.includes('privado') || error.message.includes('private')) {
      errorMsg = 'Vídeo privado ou restrito';
      suggestion = 'Este vídeo não está disponível para download';
    }
    
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.innerHTML = `❌ ${errorMsg}${suggestion ? '<br><small>' + suggestion + '</small>' : ''}`;
    progressStatus.style.color = '#ef4444';
    
    setTimeout(() => {
      progressModal.style.display = 'none';
      progressStatus.style.color = '';
    }, 5000);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showLoading() {
  loadingSpinner.style.display = 'block';
  videosGrid.style.display = 'none';
}

function hideLoading() {
  loadingSpinner.style.display = 'none';
  videosGrid.style.display = 'grid';
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

function hideError() {
  errorMessage.style.display = 'none';
}