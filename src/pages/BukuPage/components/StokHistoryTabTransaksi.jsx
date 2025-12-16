import React, { useState, useMemo } from 'react';
import { Card, Table, Input, Row, Col, Typography, DatePicker, Statistic, Button, Space, Spin, Tag } from 'antd';
import { ReloadOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

// --- CUSTOM HOOKS ---
import { usestock_historyStream } from '../../../hooks/useFirebaseData'; 
import useDebounce from '../../../hooks/useDebounce'; 
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const StokHistoryTab = () => {
    // --- 1. STATE & PARAMS ---
    const [dateRange, setDateRange] = useState([
        dayjs().subtract(1, 'month').startOf('month'), 
        dayjs().endOf('month')
    ]);

    const streamParams = useMemo(() => ({
        startDate: dateRange && dateRange[0] ? dateRange[0].startOf('day').valueOf() : null,
        endDate: dateRange && dateRange[1] ? dateRange[1].endOf('day').valueOf() : null
    }), [dateRange]);

    // --- 2. USE STREAM HOOK ---
    const { historyList, loadingHistory } = usestock_historyStream(streamParams);

    // --- 3. FILTERING CLIENT SIDE ---
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);

    const filteredHistory = useMemo(() => {
        let data = [...(historyList || [])];

        if (debouncedSearchText) {
            const lowerSearch = debouncedSearchText.toLowerCase();
            data = data.filter(item =>
                (item.judul || '').toLowerCase().includes(lowerSearch) ||
                (item.bukuId || '').toLowerCase().includes(lowerSearch) ||
                (item.nama || '').toLowerCase().includes(lowerSearch) ||
                (item.refId || '').toLowerCase().includes(lowerSearch) || 
                (item.keterangan || '').toLowerCase().includes(lowerSearch)
            );
        }
        
        return data;
    }, [historyList, debouncedSearchText]);

    // --- 4. DASHBOARD RINGKASAN ---
    const dashboardData = useMemo(() => {
        return filteredHistory.reduce((acc, item) => {
            const perubahan = Number(item.perubahan) || 0; 
            if (perubahan > 0) {
                acc.totalMasuk += perubahan;
            } else if (perubahan < 0) {
                acc.totalKeluar += perubahan; 
            }
            return acc;
        }, { totalMasuk: 0, totalKeluar: 0 });
    }, [filteredHistory]);

    // --- 5. HANDLERS ---
    const handleRefresh = () => {
       const current = [...dateRange];
       setDateRange([]); 
       setTimeout(() => setDateRange(current), 100);
    };

    const resetFilters = () => {
        setSearchText('');
        setDateRange([dayjs().subtract(1, 'month').startOf('month'), dayjs().endOf('month')]);
    };

    // --- 6. COLUMNS ---
    const historyColumns = [
        {
            title: 'Waktu', 
            dataIndex: 'tanggal', 
            key: 'tanggal',
            render: (val) => timestampFormatter(val),
            width: 140,
            fixed: 'left',
            sorter: (a, b) => (a.tanggal || 0) - (b.tanggal || 0),
            defaultSortOrder: 'descend',
        },
        { 
            title: 'Ref ID', // KOLOM BARU: REF ID
            dataIndex: 'refId', 
            key: 'refId', 
            width: 140,
            render: (text) => text ? <Tag color="geekblue" style={{ marginRight: 0 }}>{text}</Tag> : '-'
        },
        { 
            title: 'Kode Buku', 
            dataIndex: 'bukuId', 
            key: 'bukuId', 
            width: 100,
            render: (text) => <Text code>{text}</Text>
        },
        { 
            title: 'Judul Buku', 
            dataIndex: 'judul', 
            key: 'judul', 
            width: 250, 
        },
        {
            title: 'Oleh', 
            dataIndex: 'nama',
            key: 'nama',
            width: 110,
            render: (text) => (
                <Space size={4}>
                    <UserOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
                    <Text className="text-xs">{text || '-'}</Text>
                </Space>
            )
        },  { 
            title: 'Awal', 
            dataIndex: 'stokAwal', 
            key: 'stokAwal', 
            align: 'right', 
            width: 80, 
            render: numberFormatter 
        },
        {
            title: 'Perubahan', 
            dataIndex: 'perubahan', 
            key: 'perubahan',
            align: 'right', 
            width: 100,
            render: (val) => {
                const num = Number(val); 
                const color = num > 0 ? '#52c41a' : (num < 0 ? '#f5222d' : '#8c8c8c');
                const prefix = num > 0 ? '+' : '';
                return (
                    <Text strong style={{ color: color }}>
                        {prefix}{numberFormatter(val)} 
                    </Text>
                )
            },
            sorter: (a, b) => (a.perubahan || 0) - (b.perubahan || 0),
        },
      
        { 
            title: 'Akhir', 
            dataIndex: 'stokAkhir', 
            key: 'stokAkhir', 
            align: 'right', 
            width: 80, 
            render: numberFormatter 
        },
        { 
            title: 'Keterangan', 
            dataIndex: 'keterangan', 
            key: 'keterangan', 
            width: 200,
            render: (text) => <span style={{ color: '#595959' }}>{text}</span>
        },
    ];

    return (
        <Spin spinning={loadingHistory} tip="Menyinkronkan data...">
            {/* --- Card Ringkasan --- */}
            <Card style={{ marginBottom: 16 }}>
                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                    <Col>
                         <Title level={5} style={{ margin: 0 }}>Ringkasan Periode Ini</Title>
                    </Col>
                    <Col>
                         <Button icon={<ReloadOutlined />} onClick={handleRefresh}>Sync Ulang</Button>
                    </Col>
                </Row>
                
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Card size="small" style={{ backgroundColor: '#f6ffed', border: '1px solid #b7eb8f' }}>
                            <Statistic
                                title="Total Stok Masuk"
                                value={dashboardData.totalMasuk}
                                valueStyle={{ color: '#52c41a' }}
                                prefix="+"
                                formatter={numberFormatter}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Card size="small" style={{ backgroundColor: '#fff1f0', border: '1px solid #ffccc7' }}>
                            <Statistic
                                title="Total Stok Keluar"
                                value={dashboardData.totalKeluar} 
                                valueStyle={{ color: '#f5222d' }}
                                formatter={numberFormatter}
                            />
                        </Card>
                    </Col>
                </Row>
            </Card>

            {/* --- Table Section --- */}
            <Card>
                <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <Title level={5} style={{ margin: 0 }}>Riwayat Perubahan Stok</Title>
                    </Col>
                    <Col xs={24} md={16}>
                        <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
                            <RangePicker 
                                value={dateRange}
                                onChange={(dates) => setDateRange(dates)}
                                allowClear={false}
                                format="DD MMM YYYY"
                                style={{ width: 240 }}
                            />
                            
                            <Input.Search
                                placeholder="Cari Judul, Kode, Ref..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                allowClear
                                style={{ width: 220 }}
                            />
                             {(debouncedSearchText) && (
                                <Button onClick={resetFilters} type="link" danger>
                                    Reset
                                </Button>
                            )}
                        </Space>
                    </Col>
                </Row>
                
                <Table
                    columns={historyColumns}
                    dataSource={filteredHistory}
                    loading={loadingHistory} 
                    rowKey="id"
                    size="small"
                    scroll={{ x: 1300, y: 'calc(100vh - 450px)' }}
                    pagination={{ 
                        defaultPageSize: 20, 
                        showSizeChanger: true, 
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} riwayat` 
                    }}
                    rowClassName={() => 'zebra-row'} 
                />
            </Card>
        </Spin>
    );
};

export default StokHistoryTab;