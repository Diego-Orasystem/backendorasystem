document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM - General
    const sidebarLinks = document.querySelectorAll('.sidebar-menu li');
    const contentPanels = document.querySelectorAll('.content-panel');
    
    // Elementos del DOM - Formularios
    const refreshBtn = document.getElementById('refresh-btn');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const filterSelect = document.getElementById('filter-select');
    const tableHeaders = document.getElementById('table-headers');
    const tableBody = document.getElementById('table-body');
    const loadingElement = document.getElementById('loading');
    const errorElement = document.getElementById('error-message');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    
    // Elementos del DOM - Estadísticas
    const statsPeriodSelect = document.getElementById('stats-period-select');
    const statsLoading = document.getElementById('stats-loading');
    const statsError = document.getElementById('stats-error');
    const statTotalRegistros = document.getElementById('stat-total-registros');
    const statHoy = document.getElementById('stat-hoy');
    const statSemana = document.getElementById('stat-semana');
    const statCrecimiento = document.getElementById('stat-crecimiento');
    
    // Variables para paginación y filtrado
    let allData = [];
    let filteredData = [];
    let currentPage = 1;
    let itemsPerPage = 10;
    let searchTerm = '';
    let currentFilter = 'all';
    
    // Referencias a los gráficos
    let timelineChart;
    let donutChart;
    let areaChart;
    
    // Función para cargar los datos
    const loadFormularios = async () => {
        // Mostrar elemento de carga
        loadingElement.style.display = 'block';
        // Ocultar mensajes de error previos
        errorElement.style.display = 'none';
        // Limpiar tabla
        tableBody.innerHTML = '';
        tableHeaders.innerHTML = '';
        
        try {
            // Petición a la API
            const response = await fetch('https://backend-orasystem-cyo2.vercel.app/api/formularios');
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Error al obtener los datos');
            }
            
            // Guardar todos los datos
            allData = result.data;
            
            if (allData.length === 0) {
                errorElement.textContent = 'No hay datos disponibles';
                errorElement.style.display = 'block';
                return;
            }
            
            // Generar encabezados de la tabla basados en el primer objeto
            generateTableHeaders();
            
            // Aplicar filtros y búsqueda iniciales
            applyFiltersAndSearch();
            
        } catch (error) {
            console.error('Error al cargar los datos:', error);
            errorElement.textContent = `Error: ${error.message}`;
            errorElement.style.display = 'block';
        } finally {
            loadingElement.style.display = 'none';
        }
    };
    
    // Generar encabezados de tabla
    const generateTableHeaders = () => {
        const firstItem = allData[0];
        const headers = Object.keys(firstItem);
        
        // Limpiar encabezados actuales
        tableHeaders.innerHTML = '';
        
        // Agregar encabezados
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = formatColumnName(header);
            th.dataset.key = header;
            
            // Añadir evento de clic para ordenar
            th.addEventListener('click', () => sortTable(header));
            
            tableHeaders.appendChild(th);
        });
    };
    
    // Función para aplicar filtros y buscar
    const applyFiltersAndSearch = () => {
        // Aplicar filtros por fecha si es necesario
        if (currentFilter === 'all') {
            filteredData = [...allData];
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);
            
            const oneMonthAgo = new Date(today);
            oneMonthAgo.setMonth(today.getMonth() - 1);
            
            filteredData = allData.filter(item => {
                // Buscar campos de tipo fecha
                const dateFields = Object.keys(item).filter(key => 
                    key.toLowerCase().includes('fecha') && item[key]
                );
                
                if (dateFields.length === 0) return true;
                
                // Usar el primer campo fecha encontrado
                const dateField = dateFields[0];
                const itemDate = new Date(item[dateField]);
                
                switch (currentFilter) {
                    case 'today':
                        return itemDate >= today;
                    case 'week':
                        return itemDate >= oneWeekAgo;
                    case 'month':
                        return itemDate >= oneMonthAgo;
                    default:
                        return true;
                }
            });
        }
        
        // Aplicar búsqueda si hay término
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredData = filteredData.filter(item => {
                return Object.values(item).some(value => 
                    value && value.toString().toLowerCase().includes(term)
                );
            });
        }
        
        // Resetear a la primera página
        currentPage = 1;
        
        // Actualizar la tabla y la paginación
        updateTable();
        updatePagination();
    };
    
    // Actualizar la tabla con los datos filtrados y paginados
    const updateTable = () => {
        // Limpiar tabla
        tableBody.innerHTML = '';
        
        // Calcular índices para paginación
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedData = filteredData.slice(startIndex, endIndex);
        
        if (paginatedData.length === 0) {
            // No hay datos para mostrar
            const noDataRow = document.createElement('tr');
            const noDataCell = document.createElement('td');
            noDataCell.colSpan = tableHeaders.children.length;
            noDataCell.textContent = 'No se encontraron datos';
            noDataCell.style.textAlign = 'center';
            noDataCell.style.padding = '20px';
            noDataRow.appendChild(noDataCell);
            tableBody.appendChild(noDataRow);
            return;
        }
        
        // Identificar las claves del objeto
        const keys = Object.keys(allData[0]);
        
        // Mostrar datos paginados
        paginatedData.forEach(item => {
            const row = document.createElement('tr');
            
            keys.forEach(key => {
                const cell = document.createElement('td');
                
                // Formatear las fechas para mejor visualización
                if (key.toLowerCase().includes('fecha') && item[key]) {
                    cell.textContent = formatDate(item[key]);
                } else {
                    cell.textContent = item[key] !== null ? item[key] : '';
                }
                
                row.appendChild(cell);
            });
            
            tableBody.appendChild(row);
        });
    };
    
    // Actualizar información de paginación
    const updatePagination = () => {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        pageInfo.textContent = `Página ${currentPage} de ${totalPages || 1}`;
        
        // Habilitar/deshabilitar botones de navegación
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    };
    
    // Ordenar la tabla por columna
    const sortTable = (columnKey) => {
        filteredData.sort((a, b) => {
            const aValue = a[columnKey];
            const bValue = b[columnKey];
            
            // Si es una fecha, convertir a objetos Date
            if (columnKey.toLowerCase().includes('fecha')) {
                return new Date(aValue) - new Date(bValue);
            }
            
            // Para strings, usar localeCompare
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return aValue.localeCompare(bValue);
            }
            
            // Para números u otros tipos
            return aValue - bValue;
        });
        
        // Actualizar tabla
        updateTable();
    };
    
    // Función para formatear nombres de columnas
    const formatColumnName = (name) => {
        return name
            // Separar CamelCase en palabras
            .replace(/([A-Z])/g, ' $1')
            // Primera letra en mayúscula
            .replace(/^./, str => str.toUpperCase());
    };
    
    // Función para formatear fechas
    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleString('es-ES', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    };
    
    // Cargar y mostrar estadísticas
    const loadEstadisticas = async () => {
        if (allData.length === 0) {
            await loadFormularios();
        }
        
        statsLoading.style.display = 'block';
        statsError.style.display = 'none';
        
        try {
            // Actualizar tarjetas de resumen con datos
            updateStatCards();
            
            // Inicializar/actualizar gráficos
            initCharts();
            
        } catch (error) {
            console.error('Error al cargar estadísticas:', error);
            statsError.textContent = `Error: ${error.message}`;
            statsError.style.display = 'block';
        } finally {
            statsLoading.style.display = 'none';
        }
    };
    
    // Actualizar tarjetas de resumen
    const updateStatCards = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        
        // Encuentra qué campo tiene fechas
        const firstItem = allData[0];
        const dateField = Object.keys(firstItem).find(key => 
            key.toLowerCase().includes('fecha') && firstItem[key]
        ) || '';
        
        // Calcular estadísticas
        const totalRegistros = allData.length;
        
        let registrosHoy = 0;
        let registrosSemana = 0;
        let registrosMesAnterior = 0;
        let registrosMesActual = 0;
        
        if (dateField) {
            const twoMonthsAgo = new Date(oneMonthAgo);
            twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1);
            
            allData.forEach(item => {
                const fecha = new Date(item[dateField]);
                
                if (fecha >= today) {
                    registrosHoy++;
                }
                
                if (fecha >= oneWeekAgo) {
                    registrosSemana++;
                }
                
                if (fecha >= oneMonthAgo) {
                    registrosMesActual++;
                } else if (fecha >= twoMonthsAgo && fecha < oneMonthAgo) {
                    registrosMesAnterior++;
                }
            });
        }
        
        // Calcular crecimiento (porcentaje de cambio respecto al mes anterior)
        let crecimiento = 0;
        if (registrosMesAnterior > 0) {
            crecimiento = ((registrosMesActual - registrosMesAnterior) / registrosMesAnterior) * 100;
        } else if (registrosMesActual > 0) {
            crecimiento = 100; // Si no había registros anteriores, es 100% de crecimiento
        }
        
        // Actualizar elementos en la interfaz
        statTotalRegistros.textContent = totalRegistros;
        statHoy.textContent = registrosHoy;
        statSemana.textContent = registrosSemana;
        statCrecimiento.textContent = `${crecimiento.toFixed(1)}%`;
        
        // Añadir color según crecimiento
        if (crecimiento > 0) {
            statCrecimiento.style.color = '#27ae60';
        } else if (crecimiento < 0) {
            statCrecimiento.style.color = '#e74c3c';
        } else {
            statCrecimiento.style.color = '#7f8c8d';
        }
    };
    
    // Inicializar o actualizar gráficos
    const initCharts = () => {
        // Encontrar campo de fecha para agrupar datos
        const firstItem = allData[0];
        const dateField = Object.keys(firstItem).find(key => 
            key.toLowerCase().includes('fecha') && firstItem[key]
        );
        
        // Encontrar un campo para categorizar (podría ser tipo, estado, etc.)
        const categoryField = Object.keys(firstItem).find(key => 
            !key.toLowerCase().includes('fecha') && 
            !key.toLowerCase().includes('id') &&
            typeof firstItem[key] === 'string'
        ) || Object.keys(firstItem)[0];
        
        // Preparar datos para gráfico de línea de tiempo
        const timelineData = prepareTimelineData(dateField);
        
        // Preparar datos para gráfico de donut
        const donutData = prepareCategoryData(categoryField);
        
        // Preparar datos para gráfico de área
        const areaData = prepareAreaData(dateField);
        
        // Crear/actualizar gráficos
        createTimelineChart(timelineData.categories, timelineData.series);
        createDonutChart(donutData.labels, donutData.series);
        createAreaChart(areaData.categories, areaData.series);
    };
    
    // Preparar datos para gráfico de línea de tiempo
    const prepareTimelineData = (dateField) => {
        // Período seleccionado
        const period = statsPeriodSelect.value;
        
        // Definir fecha de inicio según el período
        const endDate = new Date();
        let startDate = new Date();
        let format = {};
        let interval = '';
        
        switch (period) {
            case 'week':
                startDate.setDate(endDate.getDate() - 7);
                format = { day: '2-digit' };
                interval = 'day';
                break;
            case 'month':
                startDate.setDate(endDate.getDate() - 30);
                format = { day: '2-digit' };
                interval = 'day';
                break;
            case 'year':
                startDate.setMonth(endDate.getMonth() - 12);
                format = { month: 'short' };
                interval = 'month';
                break;
        }
        
        // Crear array de fechas para el eje X
        const dates = [];
        const current = new Date(startDate);
        
        while (current <= endDate) {
            dates.push(new Date(current));
            if (interval === 'day') {
                current.setDate(current.getDate() + 1);
            } else {
                current.setMonth(current.getMonth() + 1);
            }
        }
        
        // Formatear fechas para etiquetas
        const categories = dates.map(date => 
            date.toLocaleDateString('es-ES', format)
        );
        
        // Contar registros por fecha
        const counts = new Array(dates.length).fill(0);
        
        if (dateField) {
            allData.forEach(item => {
                const itemDate = new Date(item[dateField]);
                
                if (itemDate >= startDate && itemDate <= endDate) {
                    // Encontrar el índice en el array de fechas
                    let index = -1;
                    
                    if (interval === 'day') {
                        // Comparar por día
                        index = dates.findIndex(date => 
                            date.getFullYear() === itemDate.getFullYear() &&
                            date.getMonth() === itemDate.getMonth() &&
                            date.getDate() === itemDate.getDate()
                        );
                    } else {
                        // Comparar por mes
                        index = dates.findIndex(date => 
                            date.getFullYear() === itemDate.getFullYear() &&
                            date.getMonth() === itemDate.getMonth()
                        );
                    }
                    
                    if (index !== -1) {
                        counts[index]++;
                    }
                }
            });
        }
        
        return {
            categories,
            series: [{
                name: 'Registros',
                data: counts
            }]
        };
    };
    
    // Preparar datos para gráfico de donut
    const prepareCategoryData = (categoryField) => {
        // Contar ocurrencias por categoría
        const categories = {};
        
        allData.forEach(item => {
            const category = item[categoryField] || 'Otros';
            categories[category] = (categories[category] || 0) + 1;
        });
        
        // Convertir a arrays para ApexCharts
        const labels = Object.keys(categories);
        const series = Object.values(categories);
        
        return { labels, series };
    };
    
    // Preparar datos para gráfico de área
    const prepareAreaData = (dateField) => {
        // Agrupar por meses para mostrar tendencia
        const monthlyData = {};
        
        if (dateField) {
            allData.forEach(item => {
                const date = new Date(item[dateField]);
                const monthYear = `${date.getFullYear()}-${date.getMonth() + 1}`;
                
                monthlyData[monthYear] = (monthlyData[monthYear] || 0) + 1;
            });
        }
        
        // Ordenar por fecha
        const sortedMonths = Object.keys(monthlyData).sort();
        
        // Formatear etiquetas de meses
        const categories = sortedMonths.map(monthYear => {
            const [year, month] = monthYear.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1, 1);
            return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
        });
        
        const series = sortedMonths.map(month => monthlyData[month]);
        
        return {
            categories,
            series: [{
                name: 'Registros',
                data: series
            }]
        };
    };
    
    // Crear gráfico de línea de tiempo
    const createTimelineChart = (categories, series) => {
        const options = {
            series: series,
            chart: {
                height: 330,
                type: 'bar',
                toolbar: {
                    show: false
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                },
                fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
            },
            plotOptions: {
                bar: {
                    borderRadius: 4,
                    columnWidth: '60%',
                }
            },
            dataLabels: {
                enabled: false
            },
            colors: ['#e53e30'],
            xaxis: {
                categories: categories,
                labels: {
                    style: {
                        colors: '#7f8c8d',
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                title: {
                    text: 'Cantidad',
                    style: {
                        color: '#7f8c8d'
                    }
                },
                labels: {
                    style: {
                        colors: '#7f8c8d'
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + " registros";
                    }
                },
                theme: 'dark'
            },
            fill: {
                opacity: 1
            }
        };
        
        if (timelineChart) {
            timelineChart.updateOptions(options);
        } else {
            timelineChart = new ApexCharts(
                document.querySelector("#chart-timeline"), 
                options
            );
            timelineChart.render();
        }
    };
    
    // Crear gráfico de donut
    const createDonutChart = (labels, series) => {
        const options = {
            series: series,
            chart: {
                type: 'donut',
                height: 330,
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                },
                fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
            },
            labels: labels,
            plotOptions: {
                pie: {
                    donut: {
                        size: '60%',
                        labels: {
                            show: true,
                            total: {
                                show: true,
                                label: 'Total',
                                color: '#2c3e50',
                                formatter: function(w) {
                                    return w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                }
                            }
                        }
                    }
                }
            },
            dataLabels: {
                enabled: false
            },
            colors: ['#e53e30', '#2c3e50', '#7f8c8d', '#1d1d1d', '#e74c3c', '#95a5a6', '#34495e', '#f1c40f'],
            legend: {
                position: 'bottom',
                horizontalAlign: 'center'
            },
            responsive: [{
                breakpoint: 480,
                options: {
                    chart: {
                        height: 300
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }],
            tooltip: {
                theme: 'dark'
            }
        };
        
        if (donutChart) {
            donutChart.updateOptions(options);
        } else {
            donutChart = new ApexCharts(
                document.querySelector("#chart-donut"), 
                options
            );
            donutChart.render();
        }
    };
    
    // Crear gráfico de área
    const createAreaChart = (categories, series) => {
        const options = {
            series: series,
            chart: {
                height: 330,
                type: 'area',
                toolbar: {
                    show: false
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                },
                fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
            },
            dataLabels: {
                enabled: false
            },
            colors: ['#e53e30'],
            stroke: {
                curve: 'smooth',
                width: 3
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.3,
                    stops: [0, 90, 100],
                    colorStops: [
                        {
                            offset: 0,
                            color: '#e53e30',
                            opacity: 0.7
                        },
                        {
                            offset: 100,
                            color: '#e53e30',
                            opacity: 0.1
                        }
                    ]
                }
            },
            xaxis: {
                categories: categories,
                labels: {
                    style: {
                        colors: '#7f8c8d',
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                title: {
                    text: 'Cantidad',
                    style: {
                        color: '#7f8c8d'
                    }
                },
                labels: {
                    style: {
                        colors: '#7f8c8d'
                    }
                }
            },
            markers: {
                size: 5,
                colors: ["#e53e30"],
                strokeColors: "#fff",
                strokeWidth: 2,
                hover: {
                    size: 7
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + " registros";
                    }
                },
                theme: 'dark'
            }
        };
        
        if (areaChart) {
            areaChart.updateOptions(options);
        } else {
            areaChart = new ApexCharts(
                document.querySelector("#chart-area"), 
                options
            );
            areaChart.render();
        }
    };
    
    // Función para cambiar entre secciones
    const changeSection = (sectionId) => {
        // Actualizar menú
        sidebarLinks.forEach(link => {
            if (link.dataset.section === sectionId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        
        // Mostrar panel correspondiente
        contentPanels.forEach(panel => {
            if (panel.id === `${sectionId}-panel`) {
                panel.classList.add('active');
                
                // Cargar datos si es necesario
                if (sectionId === 'estadisticas') {
                    loadEstadisticas();
                }
            } else {
                panel.classList.remove('active');
            }
        });
    };
    
    // Event Listeners
    
    // Cargar datos al iniciar
    loadFormularios();
    
    // Navegación del sidebar
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            changeSection(section);
        });
    });
    
    // Botón de actualizar
    refreshBtn.addEventListener('click', loadFormularios);
    
    // Filtros
    filterSelect.addEventListener('change', function() {
        currentFilter = this.value;
        applyFiltersAndSearch();
    });
    
    // Búsqueda
    searchBtn.addEventListener('click', function() {
        searchTerm = searchInput.value.trim();
        applyFiltersAndSearch();
    });
    
    // También buscar al presionar Enter
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchTerm = this.value.trim();
            applyFiltersAndSearch();
        }
    });
    
    // Navegación de paginación
    prevPageBtn.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            updateTable();
            updatePagination();
        }
    });
    
    nextPageBtn.addEventListener('click', function() {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            updateTable();
            updatePagination();
        }
    });
    
    // Cambio de período en estadísticas
    statsPeriodSelect.addEventListener('change', function() {
        loadEstadisticas();
    });
}); 