package com.realestate.zoningupdate.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.locationtech.jts.geom.Polygon;

import jakarta.persistence.*;

@Entity
@Table(name = "real_estate_zoning")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Parcel {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(columnDefinition = "geometry")
    private Polygon geom;

    private String name;
    private String ll_uuid;
    private String mail_city;
    private String mail_zip;
    private String mailadd;
    private Integer ogc_fid;
    private String owner;
    private String parcelnumb;
    private String path;
    private Integer struct;
    private String structstyl;
    private String usedesc;
    private String zoning;
    private String zoning_sub;
    private String zoning_typ;
}